import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { equatorialToHorizontal, solarSystemPositions } from "./astronomy.js";
import { CONSTELLATION_LINES, DEEP_SKY, SOLAR_SYSTEM_INFO, STARS } from "./catalog.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#vrCanvas");
const OBSERVER_HEIGHT = 1.6;
const SKY_RADIUS = 88;
const MIN_MAGNIFICATION = 1;
const MAX_MAGNIFICATION = 4;
const TAU = Math.PI * 2;

const state = {
  date: new Date(),
  latitude: 40.7128,
  longitude: -74.006,
  locationName: "New York City",
  playing: true,
  timeRate: 1,
  lastSkyUpdate: 0,
  selected: null,
  dragging: null,
  moved: false,
  yaw: Math.PI,
  pitch: .32,
  magnification: 1,
  controlsPlacementFrames: 0,
};

try {
  const saved = JSON.parse(localStorage.getItem("night-sky-location"));
  if (Number.isFinite(saved?.latitude) && Number.isFinite(saved?.longitude)) {
    state.latitude = saved.latitude;
    state.longitude = saved.longitude;
    state.locationName = saved.name || "Saved location";
  }
} catch {}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x01030a);

// Celestial positions are stored relative to the viewer. In desktop preview
// this group sits at the nominal eye height; in XR it is aligned to the first
// tracked headset pose so the horizon cannot drift above or below the viewer.
const skyGroup = new THREE.Group();
skyGroup.position.set(0, OBSERVER_HEIGHT, 0);
scene.add(skyGroup);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.03, 260);
camera.position.set(0, OBSERVER_HEIGHT, 0);
camera.rotation.order = "YXZ";
camera.rotation.set(state.pitch, state.yaw, 0);
scene.add(camera);

const raycaster = new THREE.Raycaster();
raycaster.far = SKY_RADIUS + 10;
const pointer = new THREE.Vector2();
const selectables = [];
const markerRecords = [];
const constellationRecords = [];
const controllerRecords = [];
const inputStates = new WeakMap();
const viewerPosition = new THREE.Vector3();
const viewerDirection = new THREE.Vector3();

function seededRandom(seed = 0x51a7f00d) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function horizontalPosition(ra, dec, radius = SKY_RADIUS) {
  const { az, alt } = equatorialToHorizontal(ra, dec, state.date, state.latitude, state.longitude);
  const azimuth = az * Math.PI / 180;
  const altitude = alt * Math.PI / 180;
  const horizontalRadius = Math.cos(altitude) * radius;
  return new THREE.Vector3(
    Math.sin(azimuth) * horizontalRadius,
    Math.sin(altitude) * radius,
    -Math.cos(azimuth) * horizontalRadius,
  );
}

function createGlowTexture(inner, middle = inner) {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 62);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(.12, inner);
  gradient.addColorStop(.36, middle);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDeepSkyTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  context.translate(64, 64);
  context.strokeStyle = "rgba(103,225,216,.95)";
  context.lineWidth = 5;
  context.beginPath();
  context.ellipse(0, 0, 31, 19, -.38, 0, TAU);
  context.stroke();
  context.globalAlpha = .42;
  context.beginPath();
  context.ellipse(0, 0, 44, 27, -.38, 0, TAU);
  context.stroke();
  context.globalAlpha = 1;
  context.beginPath();
  context.moveTo(-47, 0); context.lineTo(47, 0);
  context.moveTo(0, -47); context.lineTo(0, 47);
  context.stroke();
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabelTexture(text, color = "#dcecff") {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 1024;
  labelCanvas.height = 256;
  const context = labelCanvas.getContext("2d");
  context.font = "700 92px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(0,0,0,.95)";
  context.shadowBlur = 24;
  context.lineWidth = 18;
  context.strokeStyle = "rgba(0,0,0,.88)";
  context.strokeText(text, 512, 128);
  context.fillStyle = color;
  context.fillText(text, 512, 128);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const glowTextures = {
  blue: createGlowTexture("#b8d3ff", "rgba(105,154,255,.42)"),
  warm: createGlowTexture("#ffe1a0", "rgba(255,169,78,.45)"),
  sun: createGlowTexture("#fff1a8", "rgba(255,183,52,.58)"),
  moon: createGlowTexture("#f3f1e4", "rgba(180,205,231,.45)"),
  deep: createDeepSkyTexture(),
};

function starTexture(star) {
  return /^[OBAF]/.test(star.spectral || "") ? glowTextures.blue : glowTextures.warm;
}

const backgroundRandom = seededRandom();
const backgroundCatalog = Array.from({ length: 5200 }, () => ({
  ra: backgroundRandom() * 360,
  dec: Math.asin(backgroundRandom() * 2 - 1) * 180 / Math.PI,
  brightness: .45 + Math.pow(backgroundRandom(), 2.2) * .55,
  warmth: backgroundRandom(),
}));

const backgroundGeometry = new THREE.BufferGeometry();
backgroundGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(backgroundCatalog.length * 3), 3));
const backgroundColors = new Float32Array(backgroundCatalog.length * 3);
for (let index = 0; index < backgroundCatalog.length; index += 1) {
  const star = backgroundCatalog[index];
  const color = new THREE.Color(star.warmth > .92 ? 0xffd2a2 : star.warmth < .1 ? 0xb5ccff : 0xe6edff);
  color.multiplyScalar(star.brightness);
  color.toArray(backgroundColors, index * 3);
}
backgroundGeometry.setAttribute("color", new THREE.BufferAttribute(backgroundColors, 3));
const backgroundPoints = new THREE.Points(
  backgroundGeometry,
  new THREE.PointsMaterial({ size: .2, vertexColors: true, transparent: true, opacity: .94, sizeAttenuation: true, depthWrite: false }),
);
skyGroup.add(backgroundPoints);

function addMarker(object, texture, scale, showLabel = false) {
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  sprite.userData.skyObject = object;
  skyGroup.add(sprite);

  // The visible points are intentionally small, but selecting a sub-degree
  // target with a hand-held controller is frustrating. This invisible sprite
  // gives each object a roughly four-degree hit area without changing its look.
  const hitTarget = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hitTarget.scale.set(6, 6, 1);
  hitTarget.userData.skyObject = object;
  hitTarget.userData.marker = sprite;
  skyGroup.add(hitTarget);
  selectables.push(hitTarget);

  let label = null;
  if (showLabel) {
    label = new THREE.Sprite(new THREE.SpriteMaterial({ map: createLabelTexture(object.name), transparent: true, depthWrite: false, toneMapped: false }));
    label.scale.set(9.6, 2.4, 1);
    skyGroup.add(label);
  }
  markerRecords.push({ sprite, label, hitTarget, object, markerScale: scale });
}

for (const star of STARS) {
  const scale = THREE.MathUtils.clamp(1.25 - star.magnitude * .12, .62, 1.65);
  addMarker(star, starTexture(star), scale, star.magnitude < .8);
}

for (const object of DEEP_SKY) {
  addMarker(object, glowTextures.deep, 1.25, object.magnitude < 4.5);
}

for (const position of solarSystemPositions(state.date)) {
  const info = SOLAR_SYSTEM_INFO[position.name];
  const object = { id: `planet-${position.name.toLowerCase()}`, name: position.name, ra: position.ra, dec: position.dec, isSolarSystem: true, ...info };
  const texture = position.name === "Sun" ? glowTextures.sun : position.name === "Moon" ? glowTextures.moon : glowTextures.warm;
  const scale = position.name === "Sun" || position.name === "Moon" ? 2.2 : 1.55;
  addMarker(object, texture, scale, true);
}

const starsByName = new Map(STARS.map((star) => [star.name, star]));
for (const constellation of CONSTELLATION_LINES) {
  const stars = constellation.stars.map((name) => starsByName.get(name)).filter(Boolean);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(stars.length * 3), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x3b789c, transparent: true, opacity: .35, depthWrite: false }));
  skyGroup.add(line);
  constellationRecords.push({ line, stars });
}

function createHorizontalRing(altitude, opacity) {
  const points = [];
  for (let index = 0; index < 160; index += 1) {
    const azimuth = index / 160 * TAU;
    const alt = altitude * Math.PI / 180;
    const radius = Math.cos(alt) * SKY_RADIUS;
    points.push(new THREE.Vector3(Math.sin(azimuth) * radius, Math.sin(alt) * SKY_RADIUS, -Math.cos(azimuth) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  skyGroup.add(new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: 0x5b9ac0, transparent: true, opacity, depthWrite: false })));
}

createHorizontalRing(0, .55);
createHorizontalRing(30, .13);
createHorizontalRing(60, .13);

for (const [name, azimuth] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
  const radians = azimuth * Math.PI / 180;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: createLabelTexture(name, "#80cdec"), transparent: true, depthWrite: false, toneMapped: false }));
  label.scale.set(4.6, 1.4, 1);
  label.position.set(Math.sin(radians) * 72, 1.1, -Math.cos(radians) * 72);
  skyGroup.add(label);
}

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(210, 128),
  new THREE.MeshBasicMaterial({ color: 0x010205, side: THREE.DoubleSide }),
);
ground.rotation.x = -Math.PI / 2;
// local-floor defines y=0 as the physical floor. The previous near-eye-level
// plane made the celestial hemisphere read as though it were beneath the user.
ground.position.y = 0;
scene.add(ground);

const infoCanvas = document.createElement("canvas");
infoCanvas.width = 1024;
infoCanvas.height = 600;
const infoTexture = new THREE.CanvasTexture(infoCanvas);
infoTexture.colorSpace = THREE.SRGBColorSpace;
infoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
const infoPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(2.9, 1.7),
  new THREE.MeshBasicMaterial({ map: infoTexture, transparent: true, side: THREE.DoubleSide, depthTest: false, toneMapped: false }),
);
infoPanel.renderOrder = 100;
infoPanel.visible = false;
scene.add(infoPanel);

const controlsCanvas = document.createElement("canvas");
controlsCanvas.width = 1024;
controlsCanvas.height = 600;
const controlsTexture = new THREE.CanvasTexture(controlsCanvas);
controlsTexture.colorSpace = THREE.SRGBColorSpace;
controlsTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
const controlsPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(3.05, 1.78),
  new THREE.MeshBasicMaterial({ map: controlsTexture, transparent: true, side: THREE.DoubleSide, depthTest: false, toneMapped: false }),
);
controlsPanel.renderOrder = 101;
controlsPanel.visible = false;
scene.add(controlsPanel);

function activeViewerCamera() {
  return renderer.xr.isPresenting ? renderer.xr.getCamera(camera) : camera;
}

function placePanelInFront(panel, distance = 2.15, verticalOffset = -.12) {
  const viewer = activeViewerCamera();
  viewer.getWorldPosition(viewerPosition);
  viewer.getWorldDirection(viewerDirection).normalize();
  panel.position.copy(viewerPosition).addScaledVector(viewerDirection, distance);
  panel.position.y += verticalOffset;
  panel.lookAt(viewerPosition);
}

function alignSkyToViewer() {
  activeViewerCamera().getWorldPosition(viewerPosition);
  skyGroup.position.copy(viewerPosition);
  skyGroup.updateMatrixWorld(true);
}

function drawControlsPanel() {
  const context = controlsCanvas.getContext("2d");
  context.clearRect(0, 0, controlsCanvas.width, controlsCanvas.height);
  context.fillStyle = "rgba(5,8,14,.97)";
  context.strokeStyle = "rgba(119,210,255,.82)";
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(5, 5, 1014, 590, 38);
  context.fill();
  context.stroke();

  context.fillStyle = "#79d6ff";
  context.font = "700 26px system-ui, sans-serif";
  context.fillText("QUEST CONTROLS", 60, 72);
  context.fillStyle = "#ffffff";
  context.font = "700 56px system-ui, sans-serif";
  context.fillText("Explore the sky", 60, 145);

  const rows = [
    ["TRIGGER", "Point the blue beam and select"],
    ["THUMBSTICK  ↑ ↓", `Zoom labels and objects  ·  ${state.magnification.toFixed(1)}×`],
    ["A / X", "Show or hide this controls card"],
    ["B / Y", "Close object details"],
  ];
  rows.forEach(([control, action], index) => {
    const y = 230 + index * 76;
    context.fillStyle = "#7e96aa";
    context.font = "700 22px system-ui, sans-serif";
    context.fillText(control, 60, y);
    context.fillStyle = "#eaf2f7";
    context.font = "30px system-ui, sans-serif";
    context.fillText(action, 345, y);
  });
  context.fillStyle = "#8298aa";
  context.font = "23px system-ui, sans-serif";
  context.fillText("The horizon ring is at eye level; look upward for the visible sky.", 60, 552);
  controlsTexture.needsUpdate = true;
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || "").split(/\s+/);
  let line = "";
  let lines = 0;
  for (let index = 0; index < words.length; index += 1) {
    const test = `${line}${words[index]} `;
    if (context.measureText(test).width > maxWidth && line) {
      context.fillText(line.trim(), x, y + lines * lineHeight);
      line = `${words[index]} `;
      lines += 1;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (lines < maxLines) context.fillText(line.trim(), x, y + lines * lineHeight);
}

function updateInfoPanel(object) {
  const context = infoCanvas.getContext("2d");
  context.clearRect(0, 0, infoCanvas.width, infoCanvas.height);
  context.fillStyle = "rgba(5,8,14,.96)";
  context.strokeStyle = "rgba(119,210,255,.72)";
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(4, 4, 1016, 592, 36);
  context.fill();
  context.stroke();
  context.fillStyle = "#76cdec";
  context.font = "700 24px system-ui, sans-serif";
  context.fillText(String(object.type || "CELESTIAL OBJECT").toUpperCase(), 58, 72);
  context.fillStyle = "#ffffff";
  context.font = "700 62px system-ui, sans-serif";
  context.fillText(object.name, 58, 150);
  context.fillStyle = "#b9c6d1";
  context.font = "30px system-ui, sans-serif";
  drawWrappedText(context, object.summary, 58, 212, 900, 42, 3);
  context.fillStyle = "#6f8497";
  context.font = "700 19px system-ui, sans-serif";
  context.fillText("DISTANCE", 58, 384);
  context.fillText("MASS", 524, 384);
  context.fillStyle = "#eef4f8";
  context.font = "28px system-ui, sans-serif";
  drawWrappedText(context, object.distance || "Not known", 58, 424, 410, 35, 2);
  drawWrappedText(context, object.mass || "Not precisely known", 524, 424, 420, 35, 2);
  context.fillStyle = "#7890a3";
  context.font = "22px system-ui, sans-serif";
  context.fillText("Trigger: select another  ·  Thumbstick: zoom  ·  B/Y: close", 58, 548);
  infoTexture.needsUpdate = true;
  placePanelInFront(infoPanel);
  infoPanel.visible = true;
}

function selectObject(object) {
  state.selected = object;
  $("#vrObjectPanel").hidden = false;
  $("#vrObjectType").textContent = object.type || "Celestial object";
  $("#vrObjectName").textContent = object.name;
  $("#vrObjectSummary").textContent = object.summary || "A cataloged object in the current sky.";
  $("#vrObjectDistance").textContent = object.distance || "Not known";
  $("#vrObjectMass").textContent = object.mass || "Not precisely known";
  $("#vrObjectComposition").textContent = object.composition || "Not precisely known";
  updateInfoPanel(object);
}

function updateSky(force = false) {
  const now = performance.now();
  if (!force && now - state.lastSkyUpdate < 1000) return;
  state.lastSkyUpdate = now;

  const backgroundPositions = backgroundGeometry.attributes.position.array;
  for (let index = 0; index < backgroundCatalog.length; index += 1) {
    horizontalPosition(backgroundCatalog[index].ra, backgroundCatalog[index].dec).toArray(backgroundPositions, index * 3);
  }
  backgroundGeometry.attributes.position.needsUpdate = true;

  const solarPositions = new Map(solarSystemPositions(state.date).map((object) => [object.name, object]));
  for (const record of markerRecords) {
    if (record.object.isSolarSystem) {
      const position = solarPositions.get(record.object.name);
      if (position) {
        record.object.ra = position.ra;
        record.object.dec = position.dec;
      }
    }
    const position = horizontalPosition(record.object.ra, record.object.dec);
    record.sprite.position.copy(position);
    record.hitTarget.position.copy(position);
    if (record.label) {
      record.label.position.copy(position).multiplyScalar(.985);
      record.label.position.y += .8;
    }
  }

  for (const record of constellationRecords) {
    const positions = record.line.geometry.attributes.position.array;
    record.stars.forEach((star, index) => horizontalPosition(star.ra, star.dec, SKY_RADIUS - .5).toArray(positions, index * 3));
    record.line.geometry.attributes.position.needsUpdate = true;
  }

  $("#vrDateTime").textContent = state.date.toISOString().slice(0, 16).replace("T", " ");
  $("#vrLocation").textContent = state.locationName;
}

function applyMagnification() {
  const scale = Math.sqrt(state.magnification);
  for (const record of markerRecords) {
    record.sprite.scale.setScalar(record.markerScale * scale);
    record.sprite.scale.z = 1;
    record.hitTarget.scale.set(6, 6, 1);
    if (record.label) record.label.scale.set(9.6 * scale, 2.4 * scale, 1);
  }
}

let displayedMagnification = state.magnification.toFixed(1);
function setMagnification(value) {
  state.magnification = THREE.MathUtils.clamp(value, MIN_MAGNIFICATION, MAX_MAGNIFICATION);
  applyMagnification();
  const displayValue = state.magnification.toFixed(1);
  if (displayValue !== displayedMagnification) {
    displayedMagnification = displayValue;
    if (controlsPanel.visible) drawControlsPanel();
  }
}

function hitFromController(controller) {
  const rotation = new THREE.Matrix4().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation).normalize();
  return raycaster.intersectObjects(selectables, false)[0] || null;
}

function pulseController(inputSource) {
  const actuator = inputSource?.gamepad?.hapticActuators?.[0];
  if (actuator?.pulse) actuator.pulse(.45, 45).catch(() => {});
}

function raycastFromController(controller, event) {
  if (controlsPanel.visible) {
    controlsPanel.visible = false;
  }
  const hit = hitFromController(controller);
  if (!hit) return;
  selectObject(hit.object.userData.skyObject);
  pulseController(event?.data);
}

function updateControllerPointers() {
  for (const record of controllerRecords) {
    const hit = hitFromController(record.controller);
    record.ray.scale.z = hit ? hit.distance : SKY_RADIUS;
    record.ray.material.color.setHex(hit ? 0x61f2da : 0x80dfff);
    record.ray.material.opacity = hit ? 1 : .55;
    record.cursor.visible = Boolean(hit);
    if (hit) {
      record.cursor.position.z = -hit.distance;
      record.cursor.scale.setScalar(Math.max(1, hit.distance * .1));
    }
  }
}

function closeSelection() {
  $("#vrObjectPanel").hidden = true;
  infoPanel.visible = false;
  state.selected = null;
}

function thumbstickY(gamepad) {
  if (!gamepad?.axes?.length) return 0;
  return gamepad.axes.length >= 4 ? gamepad.axes[3] : gamepad.axes[gamepad.axes.length - 1];
}

function updateXrControls(elapsed) {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const inputSource of session.inputSources) {
    const gamepad = inputSource.gamepad;
    if (!gamepad) continue;
    const previous = inputStates.get(inputSource) || { help: false, close: false };
    const help = Boolean(gamepad.buttons[4]?.pressed);
    const close = Boolean(gamepad.buttons[5]?.pressed);
    if (help && !previous.help) {
      controlsPanel.visible = !controlsPanel.visible;
      if (controlsPanel.visible) {
        drawControlsPanel();
        placePanelInFront(controlsPanel, 2.25, -.1);
      }
    }
    if (close && !previous.close) closeSelection();
    inputStates.set(inputSource, { help, close });

    const axis = thumbstickY(gamepad);
    if (Math.abs(axis) > .18) {
      setMagnification(state.magnification * Math.exp(-axis * elapsed * 1.15));
    }
  }
}

const rayGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
for (let index = 0; index < 2; index += 1) {
  const controller = renderer.xr.getController(index);
  const ray = new THREE.Line(rayGeometry, new THREE.LineBasicMaterial({ color: 0x80dfff, transparent: true, opacity: .72 }));
  ray.scale.z = SKY_RADIUS;
  controller.add(ray);
  const cursor = new THREE.Mesh(
    new THREE.RingGeometry(.025, .042, 32),
    new THREE.MeshBasicMaterial({ color: 0x61f2da, transparent: true, opacity: .95, side: THREE.DoubleSide, depthTest: false }),
  );
  cursor.visible = false;
  controller.add(cursor);
  controller.addEventListener("selectstart", (event) => raycastFromController(controller, event));
  scene.add(controller);
  scene.add(renderer.xr.getHand(index));
  controllerRecords.push({ controller, ray, cursor });
}

const vrButton = VRButton.createButton(renderer, { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"] });
vrButton.id = "enterVrButton";
$("#enterVrSlot").append(vrButton);

async function updateXrSupport() {
  const status = $("#xrSupport");
  if (!navigator.xr) {
    status.querySelector("span").textContent = "3D preview · WebXR unavailable";
    $("#vrHelp").textContent = "This browser can show the 3D preview but does not expose WebXR. Open the published HTTPS page in Meta Quest Browser for immersive mode.";
    return;
  }
  const supported = await navigator.xr.isSessionSupported("immersive-vr");
  status.classList.toggle("ready", supported);
  status.querySelector("span").textContent = supported ? "Headset ready" : "3D preview · no headset";
}

renderer.xr.addEventListener("sessionstart", () => {
  // local-floor supplies the headset pose; the dome is aligned to that tracked
  // position during the first frames below.
  camera.position.set(0, 0, 0);
  camera.rotation.set(0, 0, 0);
  state.controlsPlacementFrames = 3;
  drawControlsPanel();
  controlsPanel.visible = true;
  $("#vrWelcome").hidden = true;
  $(".vr-time-dock").hidden = true;
  $(".drag-hint").hidden = true;
});
renderer.xr.addEventListener("sessionend", () => {
  camera.position.set(0, OBSERVER_HEIGHT, 0);
  camera.rotation.set(state.pitch, state.yaw, 0);
  skyGroup.position.set(0, OBSERVER_HEIGHT, 0);
  controlsPanel.visible = false;
  infoPanel.visible = false;
  $(".vr-time-dock").hidden = false;
  $(".drag-hint").hidden = false;
});

$("#previewButton").addEventListener("click", () => { $("#vrWelcome").hidden = true; });
$("#closeVrObject").addEventListener("click", closeSelection);
$("#vrTimeBack").addEventListener("click", () => { state.date = new Date(state.date.getTime() - 3600000); updateSky(true); });
$("#vrTimeForward").addEventListener("click", () => { state.date = new Date(state.date.getTime() + 3600000); updateSky(true); });
$("#vrPlay").addEventListener("click", () => {
  state.playing = !state.playing;
  $("#vrPlay").textContent = state.playing ? "Ⅱ" : "▶";
});
$("#vrNow").addEventListener("click", () => { state.date = new Date(); state.playing = true; $("#vrPlay").textContent = "Ⅱ"; updateSky(true); });

canvas.addEventListener("pointerdown", (event) => {
  state.dragging = { x: event.clientX, y: event.clientY, yaw: state.yaw, pitch: state.pitch };
  state.moved = false;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!state.dragging || renderer.xr.isPresenting) return;
  const dx = event.clientX - state.dragging.x;
  const dy = event.clientY - state.dragging.y;
  if (Math.hypot(dx, dy) > 3) state.moved = true;
  state.yaw = state.dragging.yaw - dx * .004;
  state.pitch = THREE.MathUtils.clamp(state.dragging.pitch - dy * .004, -1.45, 1.45);
  camera.rotation.set(state.pitch, state.yaw, 0);
});
canvas.addEventListener("pointerup", (event) => {
  if (!state.dragging) return;
  if (!state.moved && !renderer.xr.isPresenting) {
    pointer.x = event.clientX / window.innerWidth * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight * 2 - 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(selectables, false)[0];
    if (hit) selectObject(hit.object.userData.skyObject);
  }
  state.dragging = null;
});
canvas.addEventListener("pointercancel", () => { state.dragging = null; });
canvas.addEventListener("wheel", (event) => {
  if (renderer.xr.isPresenting) return;
  camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * .025, 35, 95);
  camera.updateProjectionMatrix();
}, { passive: true });

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

let lastFrame = performance.now();
renderer.setAnimationLoop((now) => {
  const elapsed = Math.min(.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.playing) state.date = new Date(state.date.getTime() + elapsed * state.timeRate * 1000);
  updateSky();
  if (renderer.xr.isPresenting) {
    // The XR camera pose becomes available after the session's first frame.
    // Align the dome and help card to the actual tracked viewer.
    if (state.controlsPlacementFrames > 0) {
      alignSkyToViewer();
      if (controlsPanel.visible) placePanelInFront(controlsPanel, 2.25, -.1);
      state.controlsPlacementFrames -= 1;
    }
    updateXrControls(elapsed);
    updateControllerPointers();
  }
  renderer.render(scene, camera);
});

updateSky(true);
applyMagnification();
updateXrSupport();
