import { equatorialToHorizontal, solarSystemPositions } from "./astronomy.js";
import { CATALOG, DEEP_SKY, SOLAR_SYSTEM_INFO, STARS } from "./catalog.js";
import { AppError } from "./app-error.js";

function invalidInput(message, details = undefined) {
  return new AppError("INVALID_INPUT", message, details);
}

function parseIsoDate(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidInput(`${field} must be an ISO date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw invalidInput(`${field} must be a valid date`);
  return date;
}

function normalizeContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw invalidInput("context must be an object");
  }
  const date = parseIsoDate(context.date, "context.date");
  const { latitude, longitude, locationName } = context;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw invalidInput("context.latitude must be between -90 and 90");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw invalidInput("context.longitude must be between -180 and 180");
  }
  if (locationName !== undefined && (typeof locationName !== "string" || locationName.length > 80)) {
    throw invalidInput("context.locationName must contain at most 80 characters");
  }
  return {
    date: date.toISOString(),
    latitude,
    longitude,
    ...(locationName === undefined ? {} : { locationName }),
  };
}

export function buildCatalogAt(dateInput) {
  const date = parseIsoDate(dateInput, "date");
  const planets = solarSystemPositions(date).map((position) => ({
    id: "planet-" + position.name.toLowerCase(),
    name: position.name,
    aliases: [],
    ra: position.ra,
    dec: position.dec,
    distanceAu: position.distanceAu,
    ...SOLAR_SYSTEM_INFO[position.name],
    isSolarSystem: true,
  }));
  return [...planets, ...CATALOG];
}

export function targetCategory(object) {
  if (object?.isSolarSystem && !["Sun", "Moon"].includes(object.name)) return "planet";
  if (object && STARS.some((star) => star.id === object.id)) return "bright_star";
  if (object && DEEP_SKY.some((target) => target.id === object.id)) return "deep_sky";
  return null;
}

export function getTargetAtContext(targetId, context, catalog = undefined) {
  if (typeof targetId !== "string" || targetId.trim() === "") {
    throw invalidInput("targetId must be a non-empty string");
  }
  const normalizedContext = normalizeContext(context);
  const resolvedCatalog = catalog === undefined ? buildCatalogAt(normalizedContext.date) : catalog;
  if (!Array.isArray(resolvedCatalog)) throw invalidInput("catalog must be an array");
  const object = resolvedCatalog.find((target) => target.id === targetId);
  if (!object) throw new AppError("TARGET_NOT_FOUND", "Target was not found", { targetId });
  const { alt, az } = equatorialToHorizontal(
    object.ra,
    object.dec,
    new Date(normalizedContext.date),
    normalizedContext.latitude,
    normalizedContext.longitude,
  );
  return {
    id: object.id,
    name: object.name,
    category: targetCategory(object),
    magnitude: object.magnitude,
    altitude: alt,
    azimuth: az,
    ra: object.ra,
    dec: object.dec,
  };
}

const OBSERVABLE_CATEGORIES = ["planet", "bright_star", "deep_sky"];

function requireNumberInRange(value, field, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw invalidInput(`${field} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function requireIntegerInRange(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw invalidInput(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function normalizeObservableFilters(filters) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    throw invalidInput("filters must be an object");
  }
  const { categories, minAltitude, maxMagnitude, limit } = filters;
  if (!Array.isArray(categories) || categories.length < 1 || categories.length > 3) {
    throw invalidInput("categories must contain one to three categories");
  }
  if (new Set(categories).size !== categories.length ||
      categories.some((category) => !OBSERVABLE_CATEGORIES.includes(category))) {
    throw invalidInput("categories must be unique supported categories");
  }
  return {
    categories,
    minAltitude: requireNumberInRange(minAltitude, "minAltitude", 0, 90),
    ...(maxMagnitude === undefined
      ? {}
      : { maxMagnitude: requireNumberInRange(maxMagnitude, "maxMagnitude", -30, 15) }),
    limit: requireIntegerInRange(limit, "limit", 1, 12),
  };
}

export function findObservableTargets(catalog, context, filters) {
  if (!Array.isArray(catalog)) throw invalidInput("catalog must be an array");
  const normalizedContext = normalizeContext(context);
  const normalizedFilters = normalizeObservableFilters(filters);
  const results = catalog
    .map((object) => {
      const category = targetCategory(object);
      if (!category || !normalizedFilters.categories.includes(category)) return null;
      return getTargetAtContext(object.id, normalizedContext, catalog);
    })
    .filter((target) => target && target.altitude >= normalizedFilters.minAltitude)
    .filter((target) => normalizedFilters.maxMagnitude === undefined || target.magnitude <= normalizedFilters.maxMagnitude)
    .sort((a, b) =>
      b.altitude - a.altitude ||
      (Number.isFinite(a.magnitude) ? a.magnitude : Infinity) -
        (Number.isFinite(b.magnitude) ? b.magnitude : Infinity) ||
      a.name.localeCompare(b.name),
    )
    .slice(0, normalizedFilters.limit);
  if (results.length === 0) {
    throw new AppError("NO_OBSERVABLE_TARGETS", "No targets match the observing filters");
  }
  return results;
}

const AUDIENCES = ["child", "beginner", "general", "experienced"];

function requireString(value, field, minimum, maximum) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    throw invalidInput(`${field} must contain between ${minimum} and ${maximum} characters`);
  }
  return value;
}

function normalizeCategoryRequirements(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidInput("categoryRequirements must be an object");
  }
  if (Object.keys(value).length !== OBSERVABLE_CATEGORIES.length ||
      OBSERVABLE_CATEGORIES.some((category) => !(category in value)) ||
      Object.keys(value).some((category) => !OBSERVABLE_CATEGORIES.includes(category))) {
    throw invalidInput("categoryRequirements must contain every supported category");
  }
  return Object.fromEntries(OBSERVABLE_CATEGORIES.map((category) => {
    const count = value[category];
    if (!Number.isInteger(count) || count < 0 || count > 12) {
      throw invalidInput(`categoryRequirements.${category} must be an integer between 0 and 12`);
    }
    return [category, count];
  }));
}

function normalizePlanRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw invalidInput("request must be an object");
  }
  const title = requireString(request.title, "title", 1, 90);
  if (!AUDIENCES.includes(request.audience)) throw invalidInput("audience must be supported");
  const notes = request.notes === undefined ? "" : request.notes;
  if (typeof notes !== "string" || notes.length > 500) {
    throw invalidInput("notes must contain at most 500 characters");
  }
  const durationMinutes = requireIntegerInRange(request.durationMinutes, "durationMinutes", 10, 180);
  if (!Array.isArray(request.targetIds) || request.targetIds.length < 1 || request.targetIds.length > 12 ||
      request.targetIds.some((targetId) => typeof targetId !== "string" || targetId === "") ||
      new Set(request.targetIds).size !== request.targetIds.length) {
    throw invalidInput("targetIds must contain one to twelve unique IDs");
  }
  if (request.targetIds.length > durationMinutes) {
    throw invalidInput("durationMinutes must provide at least one minute for every target");
  }
  const minAltitude = requireNumberInRange(request.minAltitude, "minAltitude", 0, 90);
  const context = normalizeContext(request.context);
  const now = parseIsoDate(request.now, "now").toISOString();
  return {
    id: requireString(request.previewId, "previewId", 1, 100),
    title,
    audience: request.audience,
    notes,
    durationMinutes,
    targetIds: [...request.targetIds],
    categoryRequirements: normalizeCategoryRequirements(request.categoryRequirements),
    minAltitude,
    context,
    now,
  };
}

function targetAtTime(object, context, date) {
  const { alt, az } = equatorialToHorizontal(
    object.ra,
    object.dec,
    date,
    context.latitude,
    context.longitude,
  );
  return { altitude: alt, azimuth: az };
}

export function previewObservingPlan(catalog, request) {
  if (!Array.isArray(catalog)) throw invalidInput("catalog must be an array");
  const normalizedRequest = normalizePlanRequest(request);
  const objects = normalizedRequest.targetIds.map((targetId) => {
    const object = catalog.find((candidate) => candidate.id === targetId);
    if (!object) throw new AppError("TARGET_NOT_FOUND", "Target was not found", { targetId });
    if (!targetCategory(object)) {
      throw invalidInput("targetIds must identify targets in an observable category", { targetId });
    }
    return object;
  });
  const categoryCounts = Object.fromEntries(OBSERVABLE_CATEGORIES.map((category) => [category, 0]));
  for (const object of objects) {
    const category = targetCategory(object);
    if (category) categoryCounts[category] += 1;
  }
  const violations = OBSERVABLE_CATEGORIES
    .filter((category) => normalizedRequest.categoryRequirements[category] > 0 &&
      categoryCounts[category] !== normalizedRequest.categoryRequirements[category])
    .map((category) => ({
      reason: "CATEGORY_REQUIREMENT",
      category,
      required: normalizedRequest.categoryRequirements[category],
      actual: categoryCounts[category],
    }));

  const baseDuration = Math.floor(normalizedRequest.durationMinutes / objects.length);
  const remainder = normalizedRequest.durationMinutes % objects.length;
  let startOffsetMinutes = 0;
  const startTime = new Date(normalizedRequest.context.date);
  const targets = objects.map((object, index) => {
    const durationMinutes = baseDuration + (index < remainder ? 1 : 0);
    const slotStart = new Date(startTime.getTime() + startOffsetMinutes * 60000);
    const slotMidpoint = new Date(slotStart.getTime() + durationMinutes * 30000);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
    const samples = [slotStart, slotMidpoint, slotEnd].map((date) => targetAtTime(
      object,
      normalizedRequest.context,
      date,
    ));
    const minimumAltitude = Math.min(...samples.map((sample) => sample.altitude));
    const midpoint = samples[1];
    const target = {
      targetId: object.id,
      name: object.name,
      category: targetCategory(object),
      startOffsetMinutes,
      durationMinutes,
      scheduledTime: slotStart.toISOString(),
      altitude: midpoint.altitude,
      azimuth: midpoint.azimuth,
      minimumAltitude,
      status: "upcoming",
    };
    if (minimumAltitude < normalizedRequest.minAltitude) {
      violations.push({
        reason: "MINIMUM_ALTITUDE",
        targetId: object.id,
        minimumAltitude,
        requiredAltitude: normalizedRequest.minAltitude,
      });
    }
    startOffsetMinutes += durationMinutes;
    return target;
  });
  if (violations.length > 0) {
    throw new AppError("PLAN_CONSTRAINT_FAILED", "Plan constraints could not be satisfied", { violations });
  }
  const preview = {
    version: 1,
    id: normalizedRequest.id,
    title: normalizedRequest.title,
    audience: normalizedRequest.audience,
    notes: normalizedRequest.notes,
    durationMinutes: normalizedRequest.durationMinutes,
    categoryRequirements: normalizedRequest.categoryRequirements,
    context: normalizedRequest.context,
    status: "preview",
    currentIndex: -1,
    createdAt: normalizedRequest.now,
    updatedAt: normalizedRequest.now,
    targets,
  };
  return validateObservingPlan(preview, catalog);
}

export function validateObservingPlan(plan, catalog) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw invalidInput("plan must be an object");
  }
  if (!Array.isArray(catalog)) throw invalidInput("catalog must be an array");
  if (plan.version !== 1) throw invalidInput("plan.version must be 1");
  requireString(plan.id, "plan.id", 1, 100);
  requireString(plan.title, "plan.title", 1, 90);
  if (!AUDIENCES.includes(plan.audience)) throw invalidInput("plan.audience must be supported");
  if (typeof plan.notes !== "string" || plan.notes.length > 500) throw invalidInput("plan.notes must be valid");
  if (!Number.isInteger(plan.durationMinutes) || plan.durationMinutes < 10 || plan.durationMinutes > 180) {
    throw invalidInput("plan.durationMinutes must be an integer between 10 and 180");
  }
  normalizeCategoryRequirements(plan.categoryRequirements);
  const normalizedContext = normalizeContext(plan.context);
  if (!['preview', 'saved'].includes(plan.status)) throw invalidInput("plan.status must be preview or saved");
  parseIsoDate(plan.createdAt, "plan.createdAt");
  parseIsoDate(plan.updatedAt, "plan.updatedAt");
  if (!Array.isArray(plan.targets) || plan.targets.length < 1 || plan.targets.length > 12) {
    throw invalidInput("plan.targets must contain one to twelve targets");
  }
  if (!Number.isInteger(plan.currentIndex) || plan.currentIndex < -1 || plan.currentIndex >= plan.targets.length) {
    throw invalidInput("plan.currentIndex is outside the target range");
  }
  const targetIds = new Set();
  const categoryCounts = Object.fromEntries(OBSERVABLE_CATEGORIES.map((category) => [category, 0]));
  let durationTotal = 0;
  const baseDuration = Math.floor(plan.durationMinutes / plan.targets.length);
  const remainder = plan.durationMinutes % plan.targets.length;
  for (const [index, target] of plan.targets.entries()) {
    if (!target || typeof target !== "object" || typeof target.targetId !== "string" || targetIds.has(target.targetId)) {
      throw invalidInput("plan targets must have unique IDs");
    }
    targetIds.add(target.targetId);
    const object = catalog.find((candidate) => candidate.id === target.targetId);
    if (!object) {
      throw new AppError("TARGET_NOT_FOUND", "Target was not found", { targetId: target.targetId });
    }
    const category = targetCategory(object);
    if (!category || target.category !== category) {
      throw invalidInput("plan target category does not match the catalog");
    }
    categoryCounts[category] += 1;
    const expectedDuration = baseDuration + (index < remainder ? 1 : 0);
    const expectedStatus = plan.currentIndex < 0
      ? "upcoming"
      : index < plan.currentIndex ? "complete" : index === plan.currentIndex ? "current" : "upcoming";
    if (typeof target.name !== "string" || target.name.trim() === "" ||
        target.startOffsetMinutes !== durationTotal ||
        target.durationMinutes !== expectedDuration || target.durationMinutes < 1 ||
        !Number.isFinite(target.altitude) || !Number.isFinite(target.azimuth) ||
        !Number.isFinite(target.minimumAltitude) ||
        target.status !== expectedStatus) {
      throw invalidInput("plan target has an invalid structural shape");
    }
    const scheduledTime = parseIsoDate(target.scheduledTime, "target.scheduledTime");
    const expectedTime = new Date(new Date(normalizedContext.date).getTime() + durationTotal * 60000);
    if (scheduledTime.getTime() !== expectedTime.getTime()) {
      throw invalidInput("target.scheduledTime must match its start offset");
    }
    durationTotal += target.durationMinutes;
  }
  if (durationTotal !== plan.durationMinutes) throw invalidInput("target durations must equal plan.durationMinutes");
  for (const category of OBSERVABLE_CATEGORIES) {
    if (plan.categoryRequirements[category] > 0 &&
        categoryCounts[category] !== plan.categoryRequirements[category]) {
      throw invalidInput("plan target categories do not meet categoryRequirements");
    }
  }
  return plan;
}
