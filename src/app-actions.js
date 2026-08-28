import { AppError } from "./app-error.js";
import { clamp, equatorialToHorizontal, horizontalToEquatorial } from "./astronomy.js";
import {
  buildCatalogAt,
  findObservableTargets as findTargets,
  getTargetAtContext,
  previewObservingPlan,
  validateObservingPlan,
} from "./observing.js";
import { savePlan as persistPlan } from "./plan-store.js";

const LOCATION_STORAGE_KEY = "night-sky-location";

function invalidInput(message, details = undefined) {
  return new AppError("INVALID_INPUT", message, details);
}

function requireIsoTime(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidInput(`${field} must be an ISO date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw invalidInput(`${field} must be a valid date`);
  return date;
}

function requireCoordinate(value, field, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw invalidInput(`${field} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function requireObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidInput(`${field} must be an object`);
  }
  return value;
}

function requireString(value, field, minimum, maximum) {
  if (typeof value !== "string" || value.trim().length < minimum || value.length > maximum) {
    throw invalidInput(`${field} must contain between ${minimum} and ${maximum} characters`);
  }
  return value;
}

function requireInteger(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw invalidInput(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function normalizeCategoryRequirements(value) {
  const categories = ["planet", "bright_star", "deep_sky"];
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== categories.length ||
      categories.some((category) => !Object.hasOwn(value, category)) ||
      Object.keys(value).some((category) => !categories.includes(category))) {
    throw invalidInput("categoryRequirements must contain every supported category");
  }
  return Object.fromEntries(categories.map((category) => [
    category,
    requireInteger(value[category], `categoryRequirements.${category}`, 0, 12),
  ]));
}

function requireAudience(value) {
  if (!["child", "beginner", "general", "experienced"].includes(value)) {
    throw invalidInput("audience must be supported");
  }
  return value;
}

function normalizeDraft(draft) {
  const planContext = requireObject(draft.context, "context");
  const locationName = planContext.locationName;
  if (locationName !== undefined && (typeof locationName !== "string" || locationName.length > 80)) {
    throw invalidInput("context.locationName must contain at most 80 characters");
  }
  return {
    ...draft,
    title: requireString(draft.title, "title", 1, 90),
    audience: requireAudience(draft.audience),
    notes: requireString(draft.notes, "notes", 0, 500),
    durationMinutes: requireInteger(draft.durationMinutes, "durationMinutes", 10, 180),
    categoryRequirements: normalizeCategoryRequirements(draft.categoryRequirements),
    minAltitude: requireCoordinate(draft.minAltitude, "minAltitude", 0, 90),
    context: {
      date: requireIsoTime(planContext.date, "context.date").toISOString(),
      latitude: requireCoordinate(planContext.latitude, "context.latitude", -90, 90),
      longitude: requireCoordinate(planContext.longitude, "context.longitude", -180, 180),
      ...(locationName === undefined ? {} : { locationName }),
    },
  };
}

export function createAppActions({
  state,
  storage,
  effects = { onStateChanged() {} },
  now = () => new Date().toISOString(),
  createId = (prefix) => prefix + "-" + Date.now().toString(36),
}) {
  const emit = (type, message, detail = {}) => {
    const change = { type, message, ...detail };
    effects.onStateChanged(change);
    return change;
  };
  const context = (date = state.date) => ({
    date: new Date(date).toISOString(),
    latitude: state.latitude,
    longitude: state.longitude,
    locationName: state.locationName,
  });
  const catalogAtState = () => buildCatalogAt(new Date(state.date).toISOString());
  const getSkyContext = () => ({
    time: new Date(state.date).toISOString(),
    location: {
      latitude: state.latitude,
      longitude: state.longitude,
      name: state.locationName,
    },
    view: {
      centerAz: state.centerAz,
      centerAlt: state.centerAlt,
      centerRa: state.centerRa,
      centerDec: state.centerDec,
      fieldOfView: state.fov,
    },
    layers: { ...state.layers },
    survey: state.survey,
    selected: state.selected ? { id: state.selected.id, name: state.selected.name } : null,
    plan: state.plan ? { id: state.plan.id, status: state.plan.status, targetCount: state.plan.targets.length } : null,
  });

  const getTargetDetails = (targetId, atTime = undefined) => {
    const targetContext = context(atTime === undefined ? state.date : requireIsoTime(atTime, "atTime"));
    const catalog = buildCatalogAt(targetContext.date);
    const target = catalog.find((candidate) => candidate.id === targetId);
    const horizontal = getTargetAtContext(targetId, targetContext, catalog);
    return {
      target: { ...target },
      ...horizontal,
      context: targetContext,
    };
  };

  const setObserverLocation = (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw invalidInput("location must be an object");
    }
    const latitude = requireCoordinate(input.latitude, "latitude", -90, 90);
    const longitude = requireCoordinate(input.longitude, "longitude", -180, 180);
    if (typeof input.locationName !== "string" || input.locationName.trim() === "" || input.locationName.length > 80) {
      throw invalidInput("locationName must contain between 1 and 80 characters");
    }
    const prior = { latitude: state.latitude, longitude: state.longitude, name: state.locationName };
    const location = { latitude, longitude, name: input.locationName };
    state.latitude = latitude;
    state.longitude = longitude;
    state.locationName = input.locationName;
    try {
      storage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ latitude, longitude, name: input.locationName }));
    } catch {}
    emit("observer-location", `Observer location set to ${location.name}`, { location, priorLocation: prior });
    return { location, priorLocation: prior };
  };

  const setObserverTime = (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw invalidInput("time must be an object");
    }
    const date = requireIsoTime(input.isoTime, "isoTime");
    const priorTime = new Date(state.date).toISOString();
    const time = date.toISOString();
    state.date = date;
    state.playing = false;
    if ("lastCatalogUpdate" in state) state.lastCatalogUpdate = 0;
    emit("observer-time", `Observer time set to ${time}`, { time, priorTime });
    return { time, priorTime };
  };

  const frameTarget = (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw invalidInput("frame input must be an object");
    }
    if (typeof input.targetId !== "string" || input.targetId.trim() === "") {
      throw invalidInput("targetId must be a non-empty string");
    }
    const catalog = catalogAtState();
    const target = catalog.find((candidate) => candidate.id === input.targetId);
    if (!target) throw new AppError("TARGET_NOT_FOUND", "Target was not found", { targetId: input.targetId });
    const fieldOfView = input.fieldOfView === undefined
      ? (state.fov > 16 ? (target.type === "Star" || target.isSolarSystem ? 12 : 6) : state.fov)
      : requireCoordinate(input.fieldOfView, "fieldOfView", 0.05, 180);
    const horizontal = equatorialToHorizontal(target.ra, target.dec, state.date, state.latitude, state.longitude);
    state.fov = fieldOfView;
    if (fieldOfView < 28 && state.survey !== "off") {
      state.centerRa = target.ra;
      state.centerDec = clamp(target.dec, -89.5, 89.5);
    } else {
      state.centerAz = horizontal.az;
      state.centerAlt = horizontal.alt;
    }
    state.selected = target;
    emit("target-framed", `Framed ${target.name}`, { targetId: target.id, fieldOfView });
    return {
      target: { id: target.id, name: target.name },
      fieldOfView,
      horizontal,
    };
  };

  const configureLayers = (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw invalidInput("layer configuration must be an object");
    }
    const layerNames = ["stars", "objects", "constellations", "grid", "labels"];
    const allowed = new Set([...layerNames, "survey"]);
    const names = Object.keys(input);
    if (names.length === 0 || names.some((name) => !allowed.has(name))) {
      throw invalidInput("configure at least one supported layer");
    }
    const nextLayers = { ...state.layers };
    const wasSurveyMode = state.fov < 28 && state.survey !== "off";
    for (const name of layerNames) {
      if (!(name in input)) continue;
      if (typeof input[name] !== "boolean") throw invalidInput(`${name} must be a boolean`);
      nextLayers[name] = input[name];
    }
    const survey = input.survey === undefined ? state.survey : input.survey;
    if (!["auto", "dss", "panstarrs", "2mass", "off"].includes(survey)) {
      throw invalidInput("survey must be auto, dss, panstarrs, 2mass, or off");
    }
    const priorLayers = { ...state.layers, survey: state.survey };
    state.layers = nextLayers;
    state.survey = survey;
    const nowSurveyMode = state.fov < 28 && state.survey !== "off";
    if (wasSurveyMode && !nowSurveyMode) {
      const horizontal = equatorialToHorizontal(state.centerRa, state.centerDec, state.date, state.latitude, state.longitude);
      state.centerAz = horizontal.az;
      state.centerAlt = horizontal.alt;
    } else if (!wasSurveyMode && nowSurveyMode) {
      const equatorial = horizontalToEquatorial(state.centerAz, state.centerAlt, state.date, state.latitude, state.longitude);
      state.centerRa = equatorial.ra;
      state.centerDec = equatorial.dec;
    }
    const layers = { ...state.layers, survey: state.survey };
    emit("layers-configured", "Sky layers configured", { layers, priorLayers });
    return { layers, priorLayers };
  };

  const findObservableTargets = (filters) => {
    requireObject(filters, "filters");
    const atTime = filters.atTime === undefined ? state.date : requireIsoTime(filters.atTime, "atTime");
    const targetContext = context(atTime);
    const targets = findTargets(buildCatalogAt(targetContext.date), targetContext, {
      categories: filters.categories,
      minAltitude: filters.minAltitude,
      ...(filters.maxMagnitude === undefined ? {} : { maxMagnitude: filters.maxMagnitude }),
      limit: filters.limit,
    });
    return { targets, context: targetContext };
  };

  const draftRequest = (draft, targetIds) => ({
    previewId: createId("preview"),
    title: draft.title,
    audience: draft.audience,
    notes: draft.notes,
    durationMinutes: draft.durationMinutes,
    targetIds,
    categoryRequirements: draft.categoryRequirements,
    minAltitude: draft.minAltitude,
    context: draft.context,
    now: now(),
  });

  const rebuildPreview = (draft, targetIds) => {
    const preview = previewObservingPlan(buildCatalogAt(draft.context.date), draftRequest(draft, targetIds));
    return {
      ...preview,
      minAltitude: draft.minAltitude,
      ...(draft.source === undefined ? {} : { source: draft.source }),
    };
  };

  const previewPlan = (input) => {
    requireObject(input, "plan request");
    requireString(input.title, "title", 1, 90);
    const observer = input.observer === undefined
      ? context(input.startTime === undefined ? state.date : requireIsoTime(input.startTime, "startTime"))
      : requireObject(input.observer, "observer");
    const planContext = {
      date: new Date(input.startTime === undefined ? state.date : requireIsoTime(input.startTime, "startTime")).toISOString(),
      latitude: observer.latitude,
      longitude: observer.longitude,
      ...(observer.locationName === undefined ? {} : { locationName: observer.locationName }),
    };
    const rawPreview = previewObservingPlan(buildCatalogAt(planContext.date), {
      previewId: createId("preview"),
      title: input.title,
      audience: input.audience,
      notes: input.notes,
      durationMinutes: input.durationMinutes,
      targetIds: input.targetIds,
      categoryRequirements: input.categoryRequirements,
      minAltitude: input.minAltitude,
      context: planContext,
      now: now(),
    });
    const preview = { ...rawPreview, minAltitude: input.minAltitude };
    state.planPreview = preview;
    state.planPanelOpen = true;
    emit("plan-previewed", `Previewed a ${preview.durationMinutes}-minute plan with ${preview.targets.length} targets`, { previewId: preview.id });
    return { preview };
  };

  const savePlan = (input) => {
    requireObject(input, "save request");
    if (!state.planPreview || input.previewId !== state.planPreview.id) {
      throw new AppError("PLAN_PREVIEW_NOT_FOUND", "The requested plan preview is not current", { previewId: input.previewId });
    }
    const saved = {
      ...structuredClone(state.planPreview),
      id: createId("plan"),
      status: "saved",
      updatedAt: now(),
    };
    delete saved.source;
    validateObservingPlan(saved, buildCatalogAt(saved.context.date));
    try {
      persistPlan(storage, saved);
    } catch (error) {
      if (error instanceof AppError && error.code === "PERSISTENCE_UNAVAILABLE") {
        state.plan = saved;
        state.planPreview = null;
        state.planPanelOpen = true;
        emit("plan-save-memory-only", "Plan is active for this page but could not be stored", { planId: saved.id });
      }
      throw error;
    }
    state.plan = saved;
    state.planPreview = null;
    state.planPanelOpen = true;
    emit("plan-saved", `Saved plan ${saved.title}`, { planId: saved.id });
    return { plan: saved };
  };

  const createManualPlan = (input) => {
    requireObject(input, "manual plan");
    const title = requireString(input.title, "title", 1, 90);
    requireAudience(input.audience);
    const durationMinutes = requireInteger(input.durationMinutes, "durationMinutes", 10, 180);
    const notes = input.notes === undefined ? "" : requireString(input.notes, "notes", 0, 500);
    const minAltitude = input.minAltitude === undefined ? 20 : requireCoordinate(input.minAltitude, "minAltitude", 0, 90);
    const categoryRequirements = input.categoryRequirements === undefined
      ? { planet: 0, bright_star: 0, deep_sky: 0 }
      : normalizeCategoryRequirements(input.categoryRequirements);
    const timestamp = now();
    const preview = normalizeDraft({
      version: 1,
      id: createId("preview"),
      title,
      audience: input.audience,
      notes,
      durationMinutes,
      categoryRequirements,
      minAltitude,
      context: context(),
      status: "preview",
      currentIndex: -1,
      createdAt: timestamp,
      updatedAt: timestamp,
      targets: [],
      source: "manual",
    });
    state.planPreview = preview;
    state.planPanelOpen = true;
    emit("plan-manual-created", `Created manual plan ${title}`, { previewId: preview.id });
    return { preview };
  };

  const requireDraft = () => {
    if (!state.planPreview) throw new AppError("PLAN_PREVIEW_NOT_FOUND", "Create or preview a plan before editing it");
    return state.planPreview;
  };

  const addTargetToPlan = (targetId) => {
    if (typeof targetId !== "string" || targetId.trim() === "") throw invalidInput("targetId must be a non-empty string");
    const draft = requireDraft();
    const targetIds = draft.targets.map((target) => target.targetId);
    if (targetIds.includes(targetId)) {
      emit("plan-target-duplicate", "Target is already in the plan", { targetId });
      return { preview: draft, duplicate: true };
    }
    const preview = rebuildPreview(draft, [...targetIds, targetId]);
    state.planPreview = preview;
    state.planPanelOpen = true;
    emit("plan-target-added", "Added target to plan", { targetId, previewId: preview.id });
    return { preview };
  };

  const updatePlan = (input) => {
    requireObject(input, "plan update");
    const allowed = new Set(["title", "audience", "notes", "durationMinutes", "categoryRequirements", "minAltitude", "startTime", "observer"]);
    const names = Object.keys(input);
    if (names.length === 0 && !state.planPreview) {
      if (!state.plan) requireDraft();
      const saved = structuredClone(state.plan);
      const preview = normalizeDraft({
        ...saved,
        id: createId("preview"),
        status: "preview",
        currentIndex: -1,
        updatedAt: now(),
        targets: saved.targets.map((target) => ({ ...target, status: "upcoming" })),
      });
      validateObservingPlan(preview, buildCatalogAt(preview.context.date));
      state.planPreview = preview;
      state.planPanelOpen = true;
      state.tour = { active: false, currentIndex: -1 };
      emit("plan-edit-started", `Editing plan ${preview.title}`, { planId: saved.id, previewId: preview.id });
      return { preview };
    }
    const draft = requireDraft();
    if (names.length === 0 || names.some((name) => !allowed.has(name))) throw invalidInput("plan update must include supported fields");
    const startTime = input.startTime === undefined ? draft.context.date : requireIsoTime(input.startTime, "startTime").toISOString();
    const observer = input.observer === undefined ? draft.context : requireObject(input.observer, "observer");
    const nextDraft = normalizeDraft({
      ...draft,
      ...input,
      context: {
        date: startTime,
        latitude: observer.latitude,
        longitude: observer.longitude,
        ...(observer.locationName === undefined ? {} : { locationName: observer.locationName }),
      },
    });
    delete nextDraft.startTime;
    delete nextDraft.observer;
    const targetIds = draft.targets.map((target) => target.targetId);
    const preview = targetIds.length === 0 ? { ...nextDraft, updatedAt: now() } : rebuildPreview(nextDraft, targetIds);
    state.planPreview = preview;
    state.planPanelOpen = true;
    emit("plan-updated", "Updated plan", { previewId: preview.id });
    return { preview };
  };

  const removeTargetFromPlan = (targetId) => {
    if (typeof targetId !== "string" || targetId.trim() === "") throw invalidInput("targetId must be a non-empty string");
    const draft = requireDraft();
    const targetIds = draft.targets.map((target) => target.targetId);
    if (!targetIds.includes(targetId)) throw new AppError("TARGET_NOT_FOUND", "Target was not found in the plan", { targetId });
    const nextTargetIds = targetIds.filter((id) => id !== targetId);
    const preview = nextTargetIds.length === 0
      ? { ...draft, targets: [], currentIndex: -1, updatedAt: now() }
      : rebuildPreview(draft, nextTargetIds);
    state.planPreview = preview;
    emit("plan-target-removed", "Removed target from plan", { targetId, previewId: preview.id });
    return { preview };
  };

  const movePlanTarget = (input) => {
    requireObject(input, "move request");
    if (typeof input.targetId !== "string" || !["earlier", "later"].includes(input.direction)) {
      throw invalidInput("move request needs targetId and direction");
    }
    const draft = requireDraft();
    const targetIds = draft.targets.map((target) => target.targetId);
    const index = targetIds.indexOf(input.targetId);
    if (index < 0) throw new AppError("TARGET_NOT_FOUND", "Target was not found in the plan", { targetId: input.targetId });
    const destination = input.direction === "earlier" ? index - 1 : index + 1;
    if (destination < 0 || destination >= targetIds.length) {
      throw new AppError("TOUR_BOUNDARY", "Target cannot be moved beyond the plan boundary", { targetId: input.targetId });
    }
    [targetIds[index], targetIds[destination]] = [targetIds[destination], targetIds[index]];
    const preview = rebuildPreview(draft, targetIds);
    state.planPreview = preview;
    emit("plan-target-moved", "Moved target in plan", { targetId: input.targetId, previewId: preview.id });
    return { preview };
  };

  const advanceTour = (input) => {
    requireObject(input, "tour request");
    if (!state.plan || state.plan.status !== "saved") throw new AppError("PLAN_NOT_SAVED", "Save a plan before starting a tour");
    const hasDirection = Object.hasOwn(input, "direction");
    const hasTargetIndex = Object.hasOwn(input, "targetIndex");
    if (hasDirection === hasTargetIndex) throw invalidInput("provide exactly one of direction or targetIndex");
    const plan = state.plan;
    if (Math.abs(plan.context.latitude - state.latitude) > 0.0001 || Math.abs(plan.context.longitude - state.longitude) > 0.0001) {
      throw new AppError("LOCATION_MISMATCH", "Plan location does not match the current observer location", {
        planLocation: plan.context,
        observerLocation: context(),
      });
    }
    let targetIndex;
    if (hasDirection) {
      if (!["start", "next", "previous"].includes(input.direction)) throw invalidInput("direction must be start, next, or previous");
      targetIndex = input.direction === "start" ? 0 : plan.currentIndex + (input.direction === "next" ? 1 : -1);
    } else {
      targetIndex = requireInteger(input.targetIndex, "targetIndex", 0, plan.targets.length - 1);
    }
    if (targetIndex < 0 || targetIndex >= plan.targets.length || (input.direction === "start" && plan.currentIndex !== -1)) {
      throw new AppError("TOUR_BOUNDARY", "Tour cannot advance beyond the plan boundary");
    }
    const targetSlot = plan.targets[targetIndex];
    const targetDate = new Date(targetSlot.scheduledTime);
    const catalog = buildCatalogAt(targetDate.toISOString());
    const target = catalog.find((candidate) => candidate.id === targetSlot.targetId);
    if (!target) throw new AppError("TARGET_NOT_FOUND", "Target was not found", { targetId: targetSlot.targetId });
    const horizontal = getTargetAtContext(target.id, { ...plan.context, date: targetDate.toISOString() }, catalog);
    const targets = plan.targets.map((item, index) => ({
      ...item,
      status: index < targetIndex ? "complete" : index === targetIndex ? "current" : "upcoming",
    }));
    const nextPlan = { ...plan, targets, currentIndex: targetIndex, updatedAt: now() };
    validateObservingPlan(nextPlan, catalog);
    state.plan = nextPlan;
    state.tour = { active: true, currentIndex: targetIndex };
    state.date = targetDate;
    state.playing = false;
    if ("lastCatalogUpdate" in state) state.lastCatalogUpdate = 0;
    state.selected = target;
    if (state.fov < 28 && state.survey !== "off") {
      state.centerRa = target.ra;
      state.centerDec = clamp(target.dec, -89.5, 89.5);
    } else {
      state.centerAz = horizontal.azimuth;
      state.centerAlt = horizontal.altitude;
    }
    state.planPanelOpen = true;
    emit("tour-advanced", `Tour moved to ${target.name}, target ${targetIndex + 1} of ${targets.length}`, { targetId: target.id, targetIndex });
    return { tour: state.tour, target: { id: target.id, name: target.name }, time: targetDate.toISOString(), altitude: horizontal.altitude };
  };

  return {
    getSkyContext,
    findObservableTargets,
    getTargetDetails,
    setObserverLocation,
    setObserverTime,
    frameTarget,
    previewPlan,
    savePlan,
    advanceTour,
    configureLayers,
    createManualPlan,
    addTargetToPlan,
    updatePlan,
    removeTargetFromPlan,
    movePlanTarget,
  };
}
