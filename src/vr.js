import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { equatorialToHorizontal, solarSystemPositions } from "./astronomy.js";
import { CONSTELLATION_LINES, DEEP_SKY, SOLAR_SYSTEM_INFO, STARS } from "./catalog.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#vrCanvas");
const OBSERVER_HEIGHT = 1.6;
const SKY_RADIUS = 88;
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

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.03, 260);
camera.position.set(0, OBSERVER_HEIGHT, 0);
camera.rotation.order = "YXZ";
camera.rotation.set(state.pitch, state.yaw, 0);
scene.add(camera);

const observer = new THREE.Vector3(0, OBSERVER_HEIGHT, 0);
const raycaster = new THREE.Raycaster();
raycaster.far = SKY_RADIUS + 10;
const pointer = new THREE.Vector2();
const selectables = [];
const markerRecords = [];
const constellationRecords = [];

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
    OBSERVER_HEIGHT + Math.sin(altitude) * radius,
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
  labelCanvas.width = 512;
  labelCanvas.height = 128;
  const context = labelCanvas.getContext("2d");
  context.font = "600 42px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.shadowColor = "rgba(0,0,0,.95)";
  context.shadowBlur = 12;
  context.lineWidth = 8;
  context.strokeStyle = "rgba(0,0,0,.88)";
  context.strokeText(text, 256, 64);
  context.fillStyle = color;
  context.fillText(text, 256, 64);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
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
scene.add(backgroundPoints);

function addMarker(object, texture, scale, showLabel = false) {
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  sprite.userData.skyObject = object;
  scene.add(sprite);
  selectables.push(sprite);

  let label = null;
  if (showLabel) {
    label = new THREE.Sprite(new THREE.SpriteMaterial({ map: createLabelTexture(object.name), transparent: true, depthWrite: false }));
    label.scale.set(4.8, 1.2, 1);
    scene.add(label);
  }
  markerRecords.push({ sprite, label, object });
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
  scene.add(line);
  constellationRecords.push({ line, stars });
}

function createHorizontalRing(altitude, opacity) {
  const points = [];
  for (let index = 0; index < 160; index += 1) {
    const azimuth = index / 160 * TAU;
    const alt = altitude * Math.PI / 180;
    const radius = Math.cos(alt) * SKY_RADIUS;
    points.push(new THREE.Vector3(Math.sin(azimuth) * radius, OBSERVER_HEIGHT + Math.sin(alt) * SKY_RADIUS, -Math.cos(azimuth) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: 0x5b9ac0, transparent: true, opacity, depthWrite: false })));
}

createHorizontalRing(0, .55);
createHorizontalRing(30, .13);
createHorizontalRing(60, .13);

for (const [name, azimuth] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
  const radians = azimuth * Math.PI / 180;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: createLabelTexture(name, "#80cdec"), transparent: true, depthWrite: false }));
  label.scale.set(2.3, .7, 1);
  label.position.set(Math.sin(radians) * 72, OBSERVER_HEIGHT + 1.1, -Math.cos(radians) * 72);
  scene.add(label);
}

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(210, 128),
  new THREE.MeshBasicMaterial({ color: 0x010205, side: THREE.DoubleSide }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = OBSERVER_HEIGHT - .08;
scene.add(ground);

const infoCanvas = document.createElement("canvas");
infoCanvas.width = 1024;
infoCanvas.height = 600;
const infoTexture = new THREE.CanvasTexture(infoCanvas);
infoTexture.colorSpace = THREE.SRGBColorSpace;
const infoPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 2),
  new THREE.MeshBasicMaterial({ map: infoTexture, transparent: true, side: THREE.DoubleSide, depthTest: false }),
);
infoPanel.renderOrder = 100;
infoPanel.visible = false;
scene.add(infoPanel);

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

function updateInfoPanel(object, marker) {
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
  context.fillText("Point at another object and press trigger to continue", 58, 548);
  infoTexture.needsUpdate = true;

  const direction = marker.position.clone().sub(observer).normalize();
  infoPanel.position.copy(observer).add(direction.multiplyScalar(4.2));
  infoPanel.position.y -= .35;
  infoPanel.lookAt(observer);
  infoPanel.visible = true;
}

function selectObject(object, marker) {
  state.selected = object;
  $("#vrObjectPanel").hidden = false;
  $("#vrObjectType").textContent = object.type || "Celestial object";
  $("#vrObjectName").textContent = object.name;
  $("#vrObjectSummary").textContent = object.summary || "A cataloged object in the current sky.";
  $("#vrObjectDistance").textContent = object.distance || "Not known";
  $("#vrObjectMass").textContent = object.mass || "Not precisely known";
  $("#vrObjectComposition").textContent = object.composition || "Not precisely known";
  updateInfoPanel(object, marker);
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

function raycastFromController(controller) {
  const rotation = new THREE.Matrix4().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation).normalize();
  const hit = raycaster.intersectObjects(selectables, false)[0];
  if (hit) selectObject(hit.object.userData.skyObject, hit.object);
}

const rayGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
for (let index = 0; index < 2; index += 1) {
  const controller = renderer.xr.getController(index);
  const ray = new THREE.Line(rayGeometry, new THREE.LineBasicMaterial({ color: 0x80dfff, transparent: true, opacity: .72 }));
  ray.scale.z = SKY_RADIUS;
  controller.add(ray);
  controller.addEventListener("selectstart", () => raycastFromController(controller));
  scene.add(controller);
  scene.add(renderer.xr.getHand(index));
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
  camera.rotation.set(0, 0, 0);
  $("#vrWelcome").hidden = true;
  $(".vr-time-dock").hidden = true;
  $(".drag-hint").hidden = true;
});
renderer.xr.addEventListener("sessionend", () => {
  camera.rotation.set(state.pitch, state.yaw, 0);
  $(".vr-time-dock").hidden = false;
  $(".drag-hint").hidden = false;
});

$("#previewButton").addEventListener("click", () => { $("#vrWelcome").hidden = true; });
$("#closeVrObject").addEventListener("click", () => {
  $("#vrObjectPanel").hidden = true;
  infoPanel.visible = false;
  state.selected = null;
});
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
    if (hit) selectObject(hit.object.userData.skyObject, hit.object);
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
  renderer.render(scene, camera);
});

updateSky(true);
updateXrSupport();
