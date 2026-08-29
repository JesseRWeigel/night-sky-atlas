import {
  angularSeparation,
  clamp,
  equatorialToHorizontal,
  formatDec,
  formatRa,
  horizontalToEquatorial,
  norm180,
  norm360,
  projectEquatorial,
  projectHorizontal,
  solarSystemPositions,
  unprojectEquatorial,
  unprojectHorizontal,
} from "./astronomy.js";
import { AppError } from "./app-error.js";
import { createAppActions } from "./app-actions.js";
import { CATALOG, CONSTELLATION_LINES, DEEP_SKY, SOLAR_SYSTEM_INFO, STARS } from "./catalog.js";
import { loadPlan } from "./plan-store.js";
import { mountPlanUi } from "./plan-ui.js";
import { setupWebMcp } from "./webmcp.js";

const $ = (selector) => document.querySelector(selector);
const canvas = $("#skyCanvas");
const ctx = canvas.getContext("2d");
const stage = $("#skyStage");
const surveyImage = $("#surveyImage");
const surveyBadge = $("#surveyBadge");
const surveyStatus = $("#surveyStatus");
const surveySpinner = surveyBadge.querySelector(".spinner");
const dateTimeInput = $("#dateTimeInput");
const speedSelect = $("#speedSelect");
const inspector = $("#inspector");
let planUi = { render() {}, announce() {} };

const state = {
  date: new Date(),
  latitude: 40.7128,
  longitude: -74.006,
  locationName: "New York City",
  centerAz: 180,
  centerAlt: 45,
  centerRa: 0,
  centerDec: 0,
  fov: 110,
  playing: true,
  timeRate: 1,
  selected: null,
  hover: null,
  rendered: [],
  surveyReady: false,
  surveyTimer: null,
  surveyRequest: 0,
  lastUiUpdate: 0,
  lastCatalogUpdate: 0,
  dynamicCatalog: [],
  layers: { stars: true, objects: true, constellations: true, grid: true, labels: true },
  survey: "auto",
  dragging: null,
  moved: false,
  width: 0,
  height: 0,
  dpr: 1,
  plan: null,
  planPreview: null,
  planPanelOpen: false,
  tour: { active: false, currentIndex: -1 },
};

const SURVEY_THRESHOLD = 28;
const SURVEYS = {
  dss: {
    id: "CDS/P/DSS2/color",
    name: "DSS2 color",
    credit: "DSS2 · STScI/NASA, ESO via CDS",
  },
  panstarrs: {
    id: "CDS/P/PanSTARRS/DR1/color-z-zg-g",
    name: "Pan-STARRS DR1",
    credit: "Pan-STARRS1 Surveys · PS1 Science Consortium via CDS",
  },
  "2mass": {
    id: "CDS/P/2MASS/color",
    name: "2MASS infrared",
    credit: "2MASS · UMass/IPAC-Caltech, NASA/NSF via CDS",
  },
};

function hashNoise(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const random = hashNoise(0x5a17c0de);
const BACKGROUND_STARS = Array.from({ length: 3800 }, (_, index) => ({
  id: `field-${index}`,
  ra: random() * 360,
  dec: Math.asin(random() * 2 - 1) * 180 / Math.PI,
  magnitude: 3.3 + Math.pow(random(), 0.42) * 3.4,
  warmth: random(),
}));

function makePlanetCatalog() {
  return solarSystemPositions(state.date).map((position) => {
    const info = SOLAR_SYSTEM_INFO[position.name];
    return {
      id: `planet-${position.name.toLowerCase()}`,
      name: position.name,
      aliases: [],
      ra: position.ra,
      dec: position.dec,
      distanceAu: position.distanceAu,
      ...info,
      isSolarSystem: true,
      image: info.image,
    };
  });
}

function updateDynamicCatalog(force = false) {
  if (!force && Date.now() - state.lastCatalogUpdate < 750) return;
  state.dynamicCatalog = makePlanetCatalog();
  state.lastCatalogUpdate = Date.now();
  if (state.selected?.isSolarSystem) {
    state.selected = state.dynamicCatalog.find((item) => item.name === state.selected.name) || state.selected;
  }
}

function allObjects() {
  return [...state.dynamicCatalog, ...CATALOG];
}

function isSurveyMode() {
  return state.fov < SURVEY_THRESHOLD && state.survey !== "off";
}

function resize() {
  const rect = stage.getBoundingClientRect();
  state.width = Math.max(1, rect.width);
  state.height = Math.max(1, rect.height);
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(state.width * state.dpr);
  canvas.height = Math.round(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  scheduleSurvey();
}

function currentCenterEquatorial() {
  if (isSurveyMode()) return { ra: state.centerRa, dec: state.centerDec };
  return horizontalToEquatorial(
    state.centerAz,
    state.centerAlt,
    state.date,
    state.latitude,
    state.longitude,
  );
}

function projectObject(object, allowBelowHorizon = false) {
  if (isSurveyMode()) {
    return projectEquatorial(
      object.ra,
      object.dec,
      state.centerRa,
      state.centerDec,
      state.fov,
      state.width,
      state.height,
    );
  }
  const horizontal = equatorialToHorizontal(
    object.ra,
    object.dec,
    state.date,
    state.latitude,
    state.longitude,
  );
  const projected = projectHorizontal(
    horizontal.az,
    horizontal.alt,
    state.centerAz,
    state.centerAlt,
    state.fov,
    state.width,
    state.height,
  );
  projected.visible = projected.visible && (allowBelowHorizon || horizontal.alt >= -0.25);
  projected.horizontal = horizontal;
  return projected;
}

function skyAtPoint(x, y) {
  if (isSurveyMode()) {
    return unprojectEquatorial(x, y, state.centerRa, state.centerDec, state.fov, state.width, state.height);
  }
  const horizontal = unprojectHorizontal(
    x,
    y,
    state.centerAz,
    state.centerAlt,
    state.fov,
    state.width,
    state.height,
  );
  return {
    ...horizontalToEquatorial(horizontal.az, horizontal.alt, state.date, state.latitude, state.longitude),
    ...horizontal,
  };
}

function spectralColor(spectral = "") {
  const letter = spectral[0];
  return ({ O: "#9eb8ff", B: "#b5c8ff", A: "#e1e8ff", F: "#f7f4ea", G: "#ffe4b2", K: "#ffc078", M: "#ff9268" })[letter] || "#e8efff";
}

function drawBackdrop(sunAltitude) {
  if (isSurveyMode() && state.surveyReady) {
    ctx.clearRect(0, 0, state.width, state.height);
    const vignette = ctx.createRadialGradient(
      state.width / 2,
      state.height / 2,
      Math.min(state.width, state.height) * 0.2,
      state.width / 2,
      state.height / 2,
      Math.max(state.width, state.height) * 0.7,
    );
    vignette.addColorStop(0, "rgba(1,4,10,0.02)");
    vignette.addColorStop(1, "rgba(1,4,10,0.42)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, state.width, state.height);
    return;
  }

  const daylight = clamp((sunAltitude + 12) / 20, 0, 1);
  const gradient = ctx.createRadialGradient(
    state.width * 0.48,
    state.height * 0.35,
    10,
    state.width * 0.5,
    state.height * 0.45,
    Math.max(state.width, state.height) * 0.8,
  );
  const top = daylight > 0.02
    ? `rgb(${Math.round(8 + daylight * 35)}, ${Math.round(19 + daylight * 70)}, ${Math.round(36 + daylight * 100)})`
    : "#030713";
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.56, daylight > 0.02 ? `rgb(${Math.round(4 + daylight * 17)}, ${Math.round(11 + daylight * 39)}, ${Math.round(26 + daylight * 76)})` : "#040815");
  gradient.addColorStop(1, "#02050c");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

  const glow = ctx.createRadialGradient(state.width * 0.5, state.height, 0, state.width * 0.5, state.height, state.height * 0.75);
  glow.addColorStop(0, `rgba(32, 73, 105, ${0.08 + daylight * 0.12})`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, state.width, state.height);
}

function strokeProjectedPath(points, color, width = 1, dash = []) {
  let open = false;
  ctx.beginPath();
  for (const point of points) {
    if (!point?.visible || point.x < -state.width || point.x > state.width * 2 || point.y < -state.height || point.y > state.height * 2) {
      open = false;
      continue;
    }
    if (!open) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
    open = true;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawHorizontalGrid() {
  if (!state.layers.grid || isSurveyMode()) return;
  for (const altitude of [0, 30, 60]) {
    const points = [];
    for (let az = 0; az <= 360; az += 3) {
      points.push(projectHorizontal(az, altitude, state.centerAz, state.centerAlt, state.fov, state.width, state.height));
    }
    strokeProjectedPath(points, altitude === 0 ? "rgba(123,171,202,.28)" : "rgba(111,145,172,.12)", altitude === 0 ? 1.1 : 0.65, altitude === 0 ? [] : [2, 7]);
  }
  for (let az = 0; az < 360; az += 30) {
    const points = [];
    for (let alt = 0; alt <= 90; alt += 2) {
      points.push(projectHorizontal(az, alt, state.centerAz, state.centerAlt, state.fov, state.width, state.height));
    }
    strokeProjectedPath(points, "rgba(111,145,172,.09)", 0.6, [2, 8]);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 9px Manrope, sans-serif";
  for (const [az, label] of [[0, "N"], [90, "E"], [180, "S"], [270, "W"]]) {
    const p = projectHorizontal(az, 0, state.centerAz, state.centerAlt, state.fov, state.width, state.height);
    if (p.visible && p.x > 12 && p.x < state.width - 12 && p.y > 12 && p.y < state.height - 12) {
      ctx.fillStyle = label === "N" ? "rgba(124,204,246,.88)" : "rgba(124,151,176,.72)";
      ctx.fillText(label, p.x, p.y - 11);
    }
  }
}

function drawEquatorialGrid() {
  if (!state.layers.grid || !isSurveyMode()) return;
  const spacing = state.fov > 10 ? 5 : state.fov > 3 ? 1 : state.fov > 0.8 ? 0.25 : 0.05;
  const decStart = Math.floor((state.centerDec - state.fov) / spacing) * spacing;
  for (let dec = decStart; dec <= state.centerDec + state.fov; dec += spacing) {
    const points = [];
    for (let offset = -state.fov; offset <= state.fov; offset += state.fov / 80) {
      points.push(projectEquatorial(norm360(state.centerRa + offset), dec, state.centerRa, state.centerDec, state.fov, state.width, state.height));
    }
    strokeProjectedPath(points, "rgba(126,174,199,.13)", .65, [2, 7]);
  }
  const raSpacing = spacing / Math.max(0.25, Math.cos(state.centerDec * Math.PI / 180));
  const raStart = Math.floor((state.centerRa - state.fov) / raSpacing) * raSpacing;
  for (let ra = raStart; ra <= state.centerRa + state.fov; ra += raSpacing) {
    const points = [];
    for (let offset = -state.fov; offset <= state.fov; offset += state.fov / 80) {
      points.push(projectEquatorial(norm360(ra), clamp(state.centerDec + offset, -89.9, 89.9), state.centerRa, state.centerDec, state.fov, state.width, state.height));
    }
    strokeProjectedPath(points, "rgba(126,174,199,.13)", .65, [2, 7]);
  }
}

function drawMilkyWay(dayAlpha) {
  if (isSurveyMode() || state.fov < 55) return;
  const points = [];
  // A smooth visual guide through well-known Milky Way landmarks.
  const anchors = [
    [266, -29], [287, 8], [310, 42], [52, 60], [84, 28], [101, -17], [130, -45], [190, -62], [240, -42], [266, -29],
  ];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const [ra1, dec1] = anchors[i];
    const [ra2, dec2] = anchors[i + 1];
    for (let t = 0; t < 1; t += .04) {
      const delta = norm180(ra2 - ra1);
      points.push(projectObject({ ra: norm360(ra1 + delta * t), dec: dec1 + (dec2 - dec1) * t }));
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.shadowBlur = 42;
  ctx.shadowColor = `rgba(111,167,207,${.13 * dayAlpha})`;
  strokeProjectedPath(points, `rgba(112,158,192,${.055 * dayAlpha})`, 32);
  ctx.restore();
}

function drawConstellations() {
  if (!state.layers.constellations || state.fov < 18) return;
  const byName = new Map(STARS.map((item) => [item.name, item]));
  ctx.font = "600 8px Manrope, sans-serif";
  ctx.textAlign = "center";
  for (const constellation of CONSTELLATION_LINES) {
    const objects = constellation.stars.map((name) => byName.get(name)).filter(Boolean);
    const points = objects.map((object) => projectObject(object));
    strokeProjectedPath(points, "rgba(91,151,190,.25)", .8);
    const visible = points.filter((p) => p.visible);
    if (visible.length > 1 && state.layers.labels && state.fov > 45) {
      const x = visible.reduce((sum, p) => sum + p.x, 0) / visible.length;
      const y = visible.reduce((sum, p) => sum + p.y, 0) / visible.length;
      ctx.fillStyle = "rgba(102,147,178,.46)";
      ctx.fillText(constellation.name.toUpperCase(), x, y - 12);
    }
  }
}

function drawPointStar(point, radius, color, alpha = 1) {
  if (radius > 1.4) {
    const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 3.6);
    glow.addColorStop(0, color);
    glow.addColorStop(.25, color.replace(")", `, ${alpha * .65})`).replace("rgb", "rgba"));
    glow.addColorStop(1, "rgba(120,180,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 3.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBackgroundStars(dayAlpha) {
  if (!state.layers.stars) return;
  const limitingMagnitude = isSurveyMode() ? clamp(5.2 + Math.log10(28 / state.fov) * 1.15, 5.2, 7.1) : clamp(6.7 - state.fov / 180 * .45, 5.7, 6.4);
  for (const object of BACKGROUND_STARS) {
    if (object.magnitude > limitingMagnitude) continue;
    const point = projectObject(object);
    if (!point.visible || point.x < -2 || point.x > state.width + 2 || point.y < -2 || point.y > state.height + 2) continue;
    const radius = clamp(.55 + (limitingMagnitude - object.magnitude) * .27, .55, 1.45);
    const color = object.warmth > .9 ? "#f3d1ad" : object.warmth < .1 ? "#c4d8ff" : "#e3eafa";
    drawPointStar(point, radius, color, dayAlpha * clamp(1.22 - object.magnitude / 10, .52, .96));
  }
}

function drawDeepObject(point, object, selected) {
  const size = selected ? 8 : clamp(5 + Math.log10(180 / state.fov) * 1.4, 5, 9);
  const color = object.type.toLowerCase().includes("galaxy") ? "#9cc9ef" : object.type.toLowerCase().includes("cluster") ? "#d5c4ff" : "#77d9cf";
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.strokeStyle = color;
  ctx.globalAlpha = selected ? 1 : .72;
  ctx.lineWidth = selected ? 1.5 : 1;
  if (object.type.toLowerCase().includes("galaxy")) {
    ctx.rotate(-.35);
    ctx.scale(1.5, .75);
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  } else if (object.type.toLowerCase().includes("cluster")) {
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 5; i += 1) {
      const angle = i * 2.4;
      ctx.fillStyle = color;
      ctx.fillRect(Math.cos(angle) * size * .55 - .6, Math.sin(angle) * size * .55 - .6, 1.2, 1.2);
    }
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size - 3, 0); ctx.lineTo(size + 3, 0);
    ctx.moveTo(0, -size - 3); ctx.lineTo(0, size + 3);
    ctx.stroke();
  }
  if (selected) {
    ctx.globalAlpha = .35;
    ctx.beginPath();
    ctx.arc(0, 0, size + 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCatalog(dayAlpha) {
  state.rendered.length = 0;
  const labelCandidates = [];

  if (state.layers.stars) {
    for (const object of STARS) {
      const point = projectObject(object);
      if (!point.visible || point.x < -20 || point.x > state.width + 20 || point.y < -20 || point.y > state.height + 20) continue;
      const selected = state.selected?.id === object.id;
      const radius = selected ? 4.2 : clamp(3.7 - object.magnitude * .75 + Math.log10(180 / state.fov) * .4, 1, 4);
      drawPointStar(point, radius, spectralColor(object.spectral), dayAlpha);
      if (selected) {
        ctx.strokeStyle = "rgba(123,211,255,.8)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(point.x, point.y, radius + 7, 0, Math.PI * 2); ctx.stroke();
      }
      state.rendered.push({ object, ...point, hitRadius: 12 });
      if (state.layers.labels && (object.magnitude < 1.1 || state.fov < 75 || selected)) labelCandidates.push({ object, point, priority: object.magnitude });
    }

    for (const object of state.dynamicCatalog) {
      const point = projectObject(object);
      if (!point.visible || point.x < -25 || point.x > state.width + 25 || point.y < -25 || point.y > state.height + 25) continue;
      const selected = state.selected?.id === object.id;
      const isSun = object.name === "Sun";
      const isMoon = object.name === "Moon";
      const radius = selected ? 7 : isSun || isMoon ? 6 : 4.2;
      const color = isSun ? "#ffe4a0" : isMoon ? "#e6e3d5" : "#f0d598";
      drawPointStar(point, radius, color, isSun ? 1 : dayAlpha);
      ctx.strokeStyle = selected ? "rgba(116,212,255,.95)" : "rgba(239,205,137,.6)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(point.x, point.y, radius + (selected ? 7 : 3), 0, Math.PI * 2); ctx.stroke();
      state.rendered.push({ object, ...point, hitRadius: 15 });
      if (state.layers.labels) labelCandidates.push({ object, point, priority: -3 });
    }
  }

  if (state.layers.objects) {
    for (const object of DEEP_SKY) {
      if (state.fov > 100 && object.magnitude > 6.2) continue;
      const point = projectObject(object);
      if (!point.visible || point.x < -25 || point.x > state.width + 25 || point.y < -25 || point.y > state.height + 25) continue;
      const selected = state.selected?.id === object.id;
      drawDeepObject(point, object, selected);
      state.rendered.push({ object, ...point, hitRadius: 15 });
      if (state.layers.labels && (state.fov < 85 || object.magnitude < 4.2 || selected)) labelCandidates.push({ object, point, priority: object.magnitude + 1 });
    }
  }

  drawLabels(labelCandidates);
}

function drawLabels(candidates) {
  candidates.sort((a, b) => a.priority - b.priority);
  const boxes = [];
  ctx.font = "500 10px Manrope, sans-serif";
  ctx.textBaseline = "middle";
  for (const candidate of candidates) {
    const label = candidate.object.catalogId || candidate.object.name;
    const width = ctx.measureText(label).width + 10;
    const x = candidate.point.x + 10;
    const y = candidate.point.y - 9;
    const box = { x: x - 3, y: y - 7, w: width, h: 14 };
    if (boxes.some((other) => box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y)) continue;
    if (x + width > state.width - 5 || y < 8) continue;
    boxes.push(box);
    ctx.fillStyle = "rgba(3,7,14,.46)";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = candidate.object.isSolarSystem ? "rgba(242,212,151,.92)" : candidate.object.type === "Star" ? "rgba(205,219,235,.8)" : "rgba(151,203,225,.82)";
    ctx.fillText(label, x, y);
  }
}

function drawHover() {
  if (!state.hover) return;
  const hit = state.rendered.find((item) => item.object.id === state.hover.id);
  if (!hit) return;
  ctx.strokeStyle = "rgba(169,223,250,.8)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hit.x, hit.y, hit.hitRadius, 0, Math.PI * 2);
  ctx.stroke();
}

function draw() {
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  updateDynamicCatalog();
  const sun = state.dynamicCatalog.find((object) => object.name === "Sun");
  const sunHorizontal = sun
    ? equatorialToHorizontal(sun.ra, sun.dec, state.date, state.latitude, state.longitude)
    : { alt: -20 };
  const dayAlpha = clamp((-sunHorizontal.alt + 5) / 13, .035, 1);
  drawBackdrop(sunHorizontal.alt);
  drawHorizontalGrid();
  drawEquatorialGrid();
  drawBackgroundStars(dayAlpha);
  drawConstellations();
  drawCatalog(dayAlpha);
  drawHover();
  updateReadout(sunHorizontal.alt);
}

function cardinal(az) {
  const directions = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
  return directions[Math.round(norm360(az) / 45) % 8];
}

function updateReadout(sunAltitude) {
  $("#viewMode").textContent = isSurveyMode() ? "DEEP SURVEY" : "LOCAL SKY";
  const center = currentCenterEquatorial();
  $("#viewDirection").textContent = isSurveyMode()
    ? `${formatRa(center.ra)} · ${formatDec(center.dec)} · ${formatFov(state.fov)} field`
    : `${state.centerAlt > 83 ? "Zenith" : `${cardinal(state.centerAz)} · ${Math.round(state.centerAlt)}° high`} · ${formatFov(state.fov)} field`;
  const condition = $("#skyCondition");
  if (sunAltitude > -6) {
    condition.classList.add("day");
    condition.innerHTML = `<i></i>${sunAltitude > 0 ? "Daylight" : "Civil twilight"}`;
  } else {
    condition.classList.remove("day");
    condition.innerHTML = `<i></i>${sunAltitude > -18 ? "Astronomical twilight" : "Night sky"}`;
  }
  const zoomFraction = clamp(Math.log(180 / state.fov) / Math.log(180 / .05), 0, 1);
  $("#zoomTrackFill").style.width = `${zoomFraction * 100}%`;
  $("#zoomTrackFill").style.height = "100%";
}

function formatFov(fov) {
  if (fov >= 10) return `${Math.round(fov)}°`;
  if (fov >= 1) return `${fov.toFixed(1)}°`;
  return `${Math.round(fov * 60)}′`;
}

function chooseSurvey() {
  if (state.survey !== "auto") return state.survey;
  if (state.centerDec > -30 && state.fov <= 5) return "panstarrs";
  return "dss";
}

function scheduleSurvey() {
  window.clearTimeout(state.surveyTimer);
  if (!isSurveyMode()) {
    state.surveyReady = false;
    surveyImage.classList.remove("visible");
    surveyBadge.hidden = true;
    return;
  }
  surveyBadge.hidden = false;
  surveySpinner.style.display = "block";
  surveyStatus.textContent = "Preparing deep-sky survey…";
  state.surveyTimer = window.setTimeout(loadSurvey, 420);
}

function loadSurvey() {
  if (!isSurveyMode() || !state.width || !state.height) return;
  const key = chooseSurvey();
  const survey = SURVEYS[key];
  const requestId = ++state.surveyRequest;
  const maxWidth = 1400;
  const width = Math.round(Math.min(maxWidth, Math.max(500, state.width * state.dpr)));
  const height = Math.round(width * state.height / state.width);
  const params = new URLSearchParams({
    hips: survey.id,
    width: String(width),
    height: String(height),
    fov: String(state.fov),
    projection: "TAN",
    coordsys: "icrs",
    ra: String(state.centerRa),
    dec: String(state.centerDec),
    format: "jpg",
  });
  state.surveyReady = false;
  surveyImage.classList.remove("visible");
  surveyBadge.hidden = false;
  surveySpinner.style.display = "block";
  surveyStatus.textContent = `Loading ${survey.name}…`;
  surveyImage.onload = () => {
    if (requestId !== state.surveyRequest) return;
    state.surveyReady = true;
    surveyImage.classList.add("visible");
    surveySpinner.style.display = "none";
    surveyStatus.textContent = survey.credit;
    surveyBadge.title = `Current image source: ${survey.credit}`;
  };
  surveyImage.onerror = () => {
    if (requestId !== state.surveyRequest) return;
    state.surveyReady = false;
    surveyImage.classList.remove("visible");
    surveySpinner.style.display = "none";
    surveyStatus.textContent = `${survey.name} unavailable · catalog view remains active`;
  };
  surveyImage.src = `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${params}`;
}

function setFov(nextFov, anchorX = state.width / 2, anchorY = state.height / 2) {
  const beforeSurvey = isSurveyMode();
  const skyBefore = skyAtPoint(anchorX, anchorY);
  state.fov = clamp(nextFov, .05, 180);
  const afterSurvey = isSurveyMode();

  if (!beforeSurvey && afterSurvey) {
    const center = horizontalToEquatorial(state.centerAz, state.centerAlt, state.date, state.latitude, state.longitude);
    state.centerRa = center.ra;
    state.centerDec = center.dec;
  } else if (beforeSurvey && !afterSurvey) {
    const horizontal = equatorialToHorizontal(state.centerRa, state.centerDec, state.date, state.latitude, state.longitude);
    state.centerAz = horizontal.az;
    state.centerAlt = horizontal.alt;
  } else if (beforeSurvey && afterSurvey) {
    const skyAfter = skyAtPoint(anchorX, anchorY);
    state.centerRa = norm360(state.centerRa + norm180(skyBefore.ra - skyAfter.ra));
    state.centerDec = clamp(state.centerDec + skyBefore.dec - skyAfter.dec, -89.5, 89.5);
  }
  scheduleSurvey();
}

function focusObject(object, fov = null) {
  if (!object) return;
  actions.frameTarget({
    targetId: object.id,
    ...(fov === null ? {} : { fieldOfView: fov }),
  });
}

function selectObject(object, shouldFocus = false) {
  if (shouldFocus) {
    focusObject(object);
    return;
  }
  state.selected = object;
  showInspector(object);
  closeMenus();
  inspector.classList.add("open");
  $("#tonightToggle").setAttribute("aria-expanded", "true");
}

function showTonightDrawer() {
  state.selected = null;
  $("#objectInspector").hidden = true;
  $("#emptyInspector").hidden = false;
  updateTonightList();
  inspector.classList.add("open");
  $("#tonightToggle").setAttribute("aria-expanded", "true");
  closeMenus();
}

function closeInspector() {
  inspector.classList.remove("open");
  $("#tonightToggle").setAttribute("aria-expanded", "false");
}

function commonsFileUrl(file) {
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(file)}`;
}

function commonsSourceUrl(file) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`;
}

function objectSurveyFallback(object) {
  const fov = object.type === "Star" ? .25 : object.type.toLowerCase().includes("galaxy") ? 2.2 : 1;
  const params = new URLSearchParams({
    hips: SURVEYS.dss.id,
    width: "800",
    height: "500",
    fov: String(fov),
    projection: "TAN",
    coordsys: "icrs",
    ra: String(object.ra),
    dec: String(object.dec),
    format: "jpg",
  });
  return `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?${params}`;
}

function showInspector(object) {
  $("#emptyInspector").hidden = true;
  $("#objectInspector").hidden = false;
  $("#objectType").textContent = `${object.type}${object.constellation ? ` · ${object.constellation}` : ""}`;
  $("#objectName").textContent = object.name;
  const names = [...new Set([object.catalogId, ...(object.aliases || [])].filter((name) => name && name !== object.name))];
  $("#objectAliases").textContent = names.join(" · ") || (object.isSolarSystem ? "Solar System" : "Bright-star catalog");
  $("#objectSummary").textContent = object.summary;
  $("#objectDistance").textContent = object.distance;
  $("#objectMass").textContent = object.mass || "Not precisely known";
  $("#objectComposition").textContent = object.composition;
  $("#objectRa").textContent = formatRa(object.ra);
  $("#objectDec").textContent = formatDec(object.dec);

  const hero = $("#objectHero");
  if (object.image) {
    hero.hidden = false;
    const image = $("#objectImage");
    image.dataset.fallback = "false";
    image.onerror = () => {
      if (image.dataset.fallback === "true") { hero.hidden = true; return; }
      image.dataset.fallback = "true";
      image.src = objectSurveyFallback(object);
      const credit = $("#imageCredit");
      credit.href = "https://alasky.cds.unistra.fr/hips-image-services/hips2fits";
      credit.textContent = "DSS2 · STScI/NASA, ESO via CDS (survey fallback)";
    };
    image.src = commonsFileUrl(object.image.file);
    image.alt = `${object.name} — ${object.image.credit}`;
    const credit = $("#imageCredit");
    credit.href = commonsSourceUrl(object.image.file);
    credit.textContent = `${object.image.credit} · ${object.image.source}`;
    credit.title = "Open the original image and license information";
  } else {
    hero.hidden = true;
    const image = $("#objectImage");
    image.onerror = null;
    image.removeAttribute("src");
  }
  updateInspectorPosition();
}

function updateInspectorPosition() {
  const object = state.selected;
  if (!object || $("#objectInspector").hidden) return;
  const horizontal = equatorialToHorizontal(object.ra, object.dec, state.date, state.latitude, state.longitude);
  $("#objectAlt").textContent = `${horizontal.alt.toFixed(1)}°`;
  $("#objectAz").textContent = `${horizontal.az.toFixed(1)}° · ${cardinal(horizontal.az)}`;
  const card = $(".visibility-card");
  const visible = horizontal.alt > 0;
  card.classList.toggle("below", !visible);
  $("#visibilityIcon").textContent = visible ? "◒" : "◓";
  $("#visibilityTitle").textContent = visible ? "Above your horizon" : "Below your horizon";
  $("#visibilityText").textContent = visible
    ? `Currently ${horizontal.alt.toFixed(0)}° high toward the ${cardinal(horizontal.az).toLowerCase()}.`
    : "Change the time or observer location to bring this object into view.";
}

function updateTonightList() {
  const bright = [...state.dynamicCatalog.filter((object) => !["Sun", "Moon"].includes(object.name)), ...DEEP_SKY, ...STARS.filter((star) => star.magnitude < .7)]
    .map((object) => ({ object, horizontal: equatorialToHorizontal(object.ra, object.dec, state.date, state.latitude, state.longitude) }))
    .filter((item) => item.horizontal.alt > 18)
    .sort((a, b) => {
      const score = (item) => (item.object.isSolarSystem ? -5 : item.object.magnitude || 5) - item.horizontal.alt / 100;
      return score(a) - score(b);
    })
    .slice(0, 4);
  const list = $("#tonightList");
  list.innerHTML = `<div class="tonight-title">In your sky now</div>${bright.map(({ object, horizontal }) => `
    <button class="tonight-item" data-id="${object.id}">
      <span><strong>${object.name}</strong><small>${object.type}${object.constellation ? ` · ${object.constellation}` : ""}</small></span>
      <span>${Math.round(horizontal.alt)}° high</span>
    </button>`).join("")}`;
}

function toDateInput(date) {
  return date.toISOString().slice(0, 16);
}

function updateTimeUi() {
  dateTimeInput.value = toDateInput(state.date);
  const solarOffsetMinutes = Math.round(state.longitude * 4);
  const solarDate = new Date(state.date.getTime() + solarOffsetMinutes * 60000);
  $("#localTimeLabel").textContent = `${solarDate.toISOString().slice(11, 16)} mean solar time at longitude`;
  updateInspectorPosition();
  updateTonightList();
}

function setLocation(latitude, longitude, name = "Custom location") {
  return actions.setObserverLocation({
    latitude: Number(latitude),
    longitude: Number(longitude),
    locationName: name,
  });
}

function restoreLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem("night-sky-location"));
    if (Number.isFinite(saved?.latitude) && Number.isFinite(saved?.longitude)) setLocation(saved.latitude, saved.longitude, saved.name || "Saved location");
  } catch {}
}

function syncLocationControls() {
  $("#latitudeInput").value = state.latitude.toFixed(4);
  $("#longitudeInput").value = state.longitude.toFixed(4);
  $("#locationName").textContent = state.locationName;
  const sitePreset = $("#sitePreset");
  const matchingPreset = [...sitePreset.options].find((option) => {
    const [latitude, longitude] = option.value.split(",");
    return Math.abs(Number(latitude) - state.latitude) < 0.00005
      && Math.abs(Number(longitude) - state.longitude) < 0.00005;
  });
  sitePreset.value = matchingPreset?.value || "custom";
}

function syncPlaybackControls() {
  speedSelect.value = String(state.timeRate);
  $("#playIcon").textContent = state.playing ? "Ⅱ" : "▶";
  $("#playToggle").setAttribute("aria-label", state.playing ? "Pause time" : "Resume time");
}

function syncLayerControls() {
  for (const [selector, key] of [["#starsLayer", "stars"], ["#objectsLayer", "objects"], ["#constellationsLayer", "constellations"], ["#gridLayer", "grid"], ["#labelsLayer", "labels"]]) {
    $(selector).checked = state.layers[key];
  }
  $("#surveySelect").value = state.survey;
}

function updatePlanCount() {
  const count = (state.planPreview || state.plan)?.targets?.length || 0;
  $("#planCount").textContent = String(count);
  $("#planCount").setAttribute("aria-label", `${count} ${count === 1 ? "target" : "targets"}`);
}

function setPlanPanelOpen(open) {
  state.planPanelOpen = open;
  $("#planRail").classList.toggle("open", open);
  $("#planRail").setAttribute("aria-hidden", String(!open));
  $("#planToggle").setAttribute("aria-expanded", String(open));
}

function onStateChanged(change) {
  if (change.type === "observer-location" || change.type === "observer-time") {
    state.lastCatalogUpdate = 0;
  }
  if (change.type === "observer-location") {
    syncLocationControls();
    updateTimeUi();
  }
  if (change.type === "observer-time" || change.type === "tour-advanced") {
    updateTimeUi();
    syncPlaybackControls();
  }
  if (change.type === "layers-configured") {
    syncLayerControls();
  }
  const surveyChanged = change.type === "layers-configured" && change.layers.survey !== change.priorLayers.survey;
  if (["observer-location", "observer-time", "target-framed"].includes(change.type) || surveyChanged || change.type === "tour-advanced") {
    scheduleSurvey();
  }
  if ((change.type === "target-framed" || change.type === "tour-advanced") && state.selected) {
    showInspector(state.selected);
    closeMenus();
    inspector.classList.add("open");
    $("#tonightToggle").setAttribute("aria-expanded", "true");
  }
  if (change.type.startsWith("plan-") || change.type === "tour-advanced") {
    planUi.render();
    updatePlanCount();
    setPlanPanelOpen(true);
  }
  planUi.announce(change.message);
}

const actions = createAppActions({
  state,
  storage: window.localStorage,
  effects: { onStateChanged },
  createId: (prefix) => `${prefix}-${typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`,
});

function runUiAction(callback) {
  try {
    return callback();
  } catch (error) {
    if (error instanceof AppError) {
      planUi.announce(error.message);
      return undefined;
    }
    console.error("Unexpected atlas UI action failure", error);
    throw error;
  }
}

const plannerActions = new Proxy(actions, {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);
    return typeof value === "function" ? (...args) => runUiAction(() => value(...args)) : value;
  },
});

function renderSearch(query) {
  const container = $("#searchResults");
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    container.hidden = true;
    return;
  }
  const results = allObjects()
    .filter((object) => [object.name, object.catalogId, ...(object.aliases || []), object.constellation, object.type].filter(Boolean).some((value) => value.toLowerCase().includes(normalized)))
    .sort((a, b) => {
      const exactA = a.name.toLowerCase().startsWith(normalized) ? 0 : 1;
      const exactB = b.name.toLowerCase().startsWith(normalized) ? 0 : 1;
      return exactA - exactB || (a.magnitude ?? 8) - (b.magnitude ?? 8);
    })
    .slice(0, 9);
  container.innerHTML = results.length ? results.map((object) => `
    <button class="search-result" data-id="${object.id}">
      <span class="result-symbol">${object.isSolarSystem ? "◉" : object.type === "Star" ? "✦" : object.type.toLowerCase().includes("galaxy") ? "◌" : "✧"}</span>
      <span><strong>${object.name}</strong><small>${object.catalogId && object.catalogId !== object.name ? `${object.catalogId} · ` : ""}${object.type}</small></span>
      <em>${object.constellation || "Solar System"}</em>
    </button>`).join("") : `<div class="search-empty">No catalog objects match “${escapeHtml(query)}”</div>`;
  container.hidden = false;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function objectById(id) {
  return allObjects().find((object) => object.id === id);
}

function closeMenus(except = null) {
  for (const [panel, button] of [[$("#locationPanel"), $("#locationToggle")], [$("#aboutPanel"), $("#aboutToggle")], [$("#layersPanel"), $("#layersToggle")]]) {
    if (panel === except) continue;
    panel.hidden = true;
    button?.setAttribute("aria-expanded", "false");
  }
  $("#searchResults").hidden = true;
}

function togglePanel(panel, button) {
  const willOpen = panel.hidden;
  closeMenus(panel);
  panel.hidden = !willOpen;
  button?.setAttribute("aria-expanded", String(willOpen));
}

function bindControls() {
  window.addEventListener("resize", resize);
  $("#zoomIn").addEventListener("click", () => setFov(state.fov / 1.7));
  $("#zoomOut").addEventListener("click", () => setFov(state.fov * 1.7));
  $("#resetView").addEventListener("click", () => {
    state.fov = 110;
    state.centerAz = 180;
    state.centerAlt = 45;
    scheduleSurvey();
  });

  $("#layersToggle").addEventListener("click", (event) => { event.stopPropagation(); togglePanel($("#layersPanel"), event.currentTarget); });
  $("#locationToggle").addEventListener("click", (event) => { event.stopPropagation(); togglePanel($("#locationPanel"), event.currentTarget); });
  $("#aboutToggle").addEventListener("click", (event) => { event.stopPropagation(); togglePanel($("#aboutPanel"), event.currentTarget); });
  $("#closeLocation").addEventListener("click", closeMenus);
  $("#closeAbout").addEventListener("click", closeMenus);
  $("#closeInspector").addEventListener("click", closeInspector);
  $("#tonightToggle").addEventListener("click", () => {
    if (inspector.classList.contains("open") && !state.selected) closeInspector();
    else showTonightDrawer();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".floating-panel") && !event.target.closest(".header-actions") && !event.target.closest(".layer-controls") && !event.target.closest(".search-wrap")) closeMenus();
  });

  for (const [selector, key] of [["#starsLayer", "stars"], ["#objectsLayer", "objects"], ["#constellationsLayer", "constellations"], ["#gridLayer", "grid"], ["#labelsLayer", "labels"]]) {
    $(selector).addEventListener("change", (event) => runUiAction(() => actions.configureLayers({ [key]: event.target.checked })));
  }
  $("#surveySelect").addEventListener("change", (event) => {
    runUiAction(() => actions.configureLayers({ survey: event.target.value }));
  });

  $("#sitePreset").addEventListener("change", (event) => {
    if (event.target.value === "custom") return;
    const [lat, lon, name] = event.target.value.split(",");
    setLocation(Number(lat), Number(lon), name);
  });
  const commitCoordinates = () => {
    const lat = Number($("#latitudeInput").value);
    const lon = Number($("#longitudeInput").value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      $("#locationMessage").textContent = "Enter a latitude from −90 to 90 and longitude from −180 to 180.";
      return;
    }
    $("#sitePreset").value = "custom";
    $("#locationMessage").textContent = "Custom coordinates applied.";
    setLocation(lat, lon, "Custom location");
  };
  $("#latitudeInput").addEventListener("change", commitCoordinates);
  $("#longitudeInput").addEventListener("change", commitCoordinates);
  $("#useLocation").addEventListener("click", () => {
    const message = $("#locationMessage");
    if (!navigator.geolocation) { message.textContent = "This browser does not provide geolocation."; return; }
    message.textContent = "Requesting your location…";
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLocation(coords.latitude, coords.longitude, "Current location"); message.textContent = `Location accurate to about ${Math.round(coords.accuracy)} m.`; },
      (error) => { message.textContent = `Location unavailable: ${error.message}`; },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  });

  dateTimeInput.addEventListener("change", () => {
    const date = new Date(`${dateTimeInput.value}Z`);
    if (!Number.isNaN(date.getTime())) {
      const wasPlaying = state.playing;
      runUiAction(() => actions.setObserverTime({ isoTime: date.toISOString() }));
      state.playing = wasPlaying;
      syncPlaybackControls();
    }
  });
  speedSelect.addEventListener("change", () => { state.timeRate = Number(speedSelect.value); state.playing = true; $("#playIcon").textContent = "Ⅱ"; });
  $("#playToggle").addEventListener("click", () => {
    state.playing = !state.playing;
    $("#playIcon").textContent = state.playing ? "Ⅱ" : "▶";
    $("#playToggle").setAttribute("aria-label", state.playing ? "Pause time" : "Resume time");
  });
  const stepAmount = () => Math.max(3600, Math.min(Math.abs(state.timeRate), 31557600));
  const stepTime = (direction) => {
    const wasPlaying = state.playing;
    const date = new Date(state.date.getTime() + direction * stepAmount() * 1000);
    runUiAction(() => actions.setObserverTime({ isoTime: date.toISOString() }));
    state.playing = wasPlaying;
    syncPlaybackControls();
  };
  $("#timeBack").addEventListener("click", () => stepTime(-1));
  $("#timeForward").addEventListener("click", () => stepTime(1));
  $("#nowButton").addEventListener("click", () => {
    runUiAction(() => actions.setObserverTime({ isoTime: new Date().toISOString() }));
    state.timeRate = 1;
    state.playing = true;
    syncPlaybackControls();
  });

  $("#searchInput").addEventListener("input", (event) => renderSearch(event.target.value));
  $("#searchInput").addEventListener("focus", (event) => renderSearch(event.target.value));
  $("#searchResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-id]");
    if (!button) return;
    const object = objectById(button.dataset.id);
    if (object) { runUiAction(() => focusObject(object)); $("#searchInput").value = object.name; }
  });
  $("#tonightList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-id]");
    if (button) runUiAction(() => focusObject(objectById(button.dataset.id)));
  });
  $("#focusObject").addEventListener("click", () => runUiAction(() => focusObject(state.selected)));
  $("#addObjectToPlan").addEventListener("click", () => runUiAction(() => {
    if (!state.selected) return;
    actions.addTargetToPlan(state.selected.id);
    setPlanPanelOpen(true);
    planUi.render();
  }));

  $("#planToggle").addEventListener("click", () => {
    setPlanPanelOpen(!state.planPanelOpen);
    if (state.planPanelOpen) planUi.render();
  });
  $("#closePlan").addEventListener("click", () => setPlanPanelOpen(false));

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    setFov(state.fov * Math.exp(event.deltaY * .0014), event.offsetX, event.offsetY);
  }, { passive: false });
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    state.dragging = { x: event.clientX, y: event.clientY, centerAz: state.centerAz, centerAlt: state.centerAlt, centerRa: state.centerRa, centerDec: state.centerDec };
    state.moved = false;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = [...state.rendered].reverse().find((item) => Math.hypot(item.x - x, item.y - y) <= item.hitRadius);
      state.hover = hit?.object || null;
      canvas.style.cursor = hit ? "pointer" : "grab";
      return;
    }
    const dx = event.clientX - state.dragging.x;
    const dy = event.clientY - state.dragging.y;
    if (Math.hypot(dx, dy) > 3) state.moved = true;
    if (isSurveyMode()) {
      const scale = state.fov / state.width;
      state.centerRa = norm360(state.dragging.centerRa + dx * scale / Math.max(.15, Math.cos(state.dragging.centerDec * Math.PI / 180)));
      state.centerDec = clamp(state.dragging.centerDec - dy * scale, -89.5, 89.5);
    } else {
      const scale = state.fov / Math.max(state.width, state.height);
      state.centerAz = norm360(state.dragging.centerAz - dx * scale / Math.max(.18, Math.cos(state.dragging.centerAlt * Math.PI / 180)));
      state.centerAlt = clamp(state.dragging.centerAlt + dy * scale, -25, 90);
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!state.dragging) return;
    if (state.moved) scheduleSurvey();
    else {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = [...state.rendered].reverse().find((item) => Math.hypot(item.x - x, item.y - y) <= item.hitRadius);
      if (hit) selectObject(hit.object);
    }
    state.dragging = null;
  });
  canvas.addEventListener("pointercancel", () => { state.dragging = null; });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !event.ctrlKey && !event.metaKey) { event.preventDefault(); $("#searchInput").focus(); }
    if (event.target.matches("input, select")) return;
    if (event.key === " ") { event.preventDefault(); $("#playToggle").click(); }
    if (event.key === "+" || event.key === "=") setFov(state.fov / 1.5);
    if (event.key === "-") setFov(state.fov * 1.5);
    const step = state.fov * .08;
    if (isSurveyMode()) {
      if (event.key === "ArrowLeft") state.centerRa = norm360(state.centerRa - step);
      if (event.key === "ArrowRight") state.centerRa = norm360(state.centerRa + step);
      if (event.key === "ArrowUp") state.centerDec = clamp(state.centerDec + step, -89.5, 89.5);
      if (event.key === "ArrowDown") state.centerDec = clamp(state.centerDec - step, -89.5, 89.5);
      if (event.key.startsWith("Arrow")) scheduleSurvey();
    } else {
      if (event.key === "ArrowLeft") state.centerAz = norm360(state.centerAz - step);
      if (event.key === "ArrowRight") state.centerAz = norm360(state.centerAz + step);
      if (event.key === "ArrowUp") state.centerAlt = clamp(state.centerAlt + step, -25, 90);
      if (event.key === "ArrowDown") state.centerAlt = clamp(state.centerAlt - step, -25, 90);
    }
  });
}

let lastFrame = performance.now();
function frame(now) {
  const elapsed = Math.min(.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.playing) state.date = new Date(state.date.getTime() + elapsed * state.timeRate * 1000);
  if (now - state.lastUiUpdate > 1000) {
    state.lastUiUpdate = now;
    updateTimeUi();
  }
  draw();
  requestAnimationFrame(frame);
}

function init() {
  updateDynamicCatalog(true);
  const center = horizontalToEquatorial(state.centerAz, state.centerAlt, state.date, state.latitude, state.longitude);
  state.centerRa = center.ra;
  state.centerDec = center.dec;
  restoreLocation();
  state.plan = loadPlan(window.localStorage);
  planUi = mountPlanUi({
    root: $("#planContent"),
    toggle: $("#planToggle"),
    status: $("#planStatus"),
    actions: plannerActions,
    getSnapshot: () => ({ preview: state.planPreview, plan: state.plan, tour: state.tour }),
    onClose: () => setPlanPanelOpen(false),
  });
  bindControls();
  planUi.render();
  updatePlanCount();
  syncLocationControls();
  syncLayerControls();
  syncPlaybackControls();
  resize();
  updateTimeUi();
  setupWebMcp(actions, document).catch((error) => {
    console.warn("WebMCP tool registration failed; the atlas remains available without tools.", error);
  });
  requestAnimationFrame(frame);
}

init();
