import { AppError } from "./app-error.js";

export const PLAN_STORAGE_KEY = "night-sky-observing-plan:v1";

const TARGET_CATEGORIES = new Set(["planet", "bright_star", "deep_sky"]);
const TARGET_STATUSES = new Set(["upcoming", "current", "complete"]);
const AUDIENCES = new Set(["child", "beginner", "general", "experienced"]);
const CATEGORY_KEYS = [...TARGET_CATEGORIES];

function invalidPlan(message) {
  throw new AppError("INVALID_PLAN", message);
}

function validDate(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(new Date(value).getTime());
}

function validBoundedString(value, minimum, maximum) {
  return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum;
}

function assertCategoryRequirements(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== CATEGORY_KEYS.length ||
      CATEGORY_KEYS.some((category) => !Object.hasOwn(value, category)) ||
      Object.keys(value).some((category) => !TARGET_CATEGORIES.has(category)) ||
      CATEGORY_KEYS.some((category) => !Number.isInteger(value[category]) || value[category] < 0 || value[category] > 12)) {
    invalidPlan("plan.categoryRequirements must contain valid supported category counts");
  }
}

function assertStoredPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    invalidPlan("plan must be an object");
  }
  if (plan.version !== 1) invalidPlan("plan.version must be 1");
  if (plan.status !== "saved") invalidPlan("plan.status must be saved");
  if (!validBoundedString(plan.id, 1, 100)) invalidPlan("plan.id must be valid");
  if (!validBoundedString(plan.title, 1, 90)) invalidPlan("plan.title must be valid");
  if (!AUDIENCES.has(plan.audience)) invalidPlan("plan.audience must be supported");
  if (typeof plan.notes !== "string" || plan.notes.length > 500) invalidPlan("plan.notes must be valid");
  if (!Number.isInteger(plan.durationMinutes) || plan.durationMinutes < 10 || plan.durationMinutes > 180) {
    invalidPlan("plan.durationMinutes must be an integer between 10 and 180");
  }
  assertCategoryRequirements(plan.categoryRequirements);
  if (!validDate(plan.createdAt) || !validDate(plan.updatedAt)) invalidPlan("plan timestamps must be valid");

  const context = plan.context;
  if (!context || typeof context !== "object" || Array.isArray(context) ||
      !validDate(context.date) ||
      !Number.isFinite(context.latitude) || context.latitude < -90 || context.latitude > 90 ||
      !Number.isFinite(context.longitude) || context.longitude < -180 || context.longitude > 180 ||
      (context.locationName !== undefined && (typeof context.locationName !== "string" || context.locationName.length > 80))) {
    invalidPlan("plan.context must contain a valid date and coordinates");
  }

  if (!Array.isArray(plan.targets) || plan.targets.length < 1 || plan.targets.length > 12) {
    invalidPlan("plan.targets must contain one to twelve targets");
  }
  if (!Number.isInteger(plan.currentIndex) || plan.currentIndex < -1 || plan.currentIndex >= plan.targets.length) {
    invalidPlan("plan.currentIndex is outside the target range");
  }

  const targetIds = new Set();
  const categoryCounts = Object.fromEntries(CATEGORY_KEYS.map((category) => [category, 0]));
  const baseDuration = Math.floor(plan.durationMinutes / plan.targets.length);
  const remainder = plan.durationMinutes % plan.targets.length;
  let durationTotal = 0;
  for (const [index, target] of plan.targets.entries()) {
    const expectedDuration = baseDuration + (index < remainder ? 1 : 0);
    const expectedStatus = plan.currentIndex < 0
      ? "upcoming"
      : index < plan.currentIndex ? "complete" : index === plan.currentIndex ? "current" : "upcoming";
    if (!target || typeof target !== "object" || Array.isArray(target) ||
        typeof target.targetId !== "string" || target.targetId.trim() === "" || targetIds.has(target.targetId) ||
        typeof target.name !== "string" || target.name.trim() === "" ||
        !TARGET_CATEGORIES.has(target.category) ||
        target.startOffsetMinutes !== durationTotal ||
        target.durationMinutes !== expectedDuration || target.durationMinutes < 1 ||
        !validDate(target.scheduledTime) ||
        !Number.isFinite(target.altitude) || !Number.isFinite(target.azimuth) ||
        !Number.isFinite(target.minimumAltitude) ||
        !TARGET_STATUSES.has(target.status) || target.status !== expectedStatus) {
      invalidPlan("plan target has an invalid structural shape");
    }
    const expectedTime = new Date(new Date(context.date).getTime() + durationTotal * 60000).getTime();
    if (new Date(target.scheduledTime).getTime() !== expectedTime) {
      invalidPlan("plan target scheduled time must match its start offset");
    }
    targetIds.add(target.targetId);
    categoryCounts[target.category] += 1;
    durationTotal += target.durationMinutes;
  }
  if (durationTotal !== plan.durationMinutes) invalidPlan("target durations must equal plan.durationMinutes");
  for (const category of CATEGORY_KEYS) {
    if (plan.categoryRequirements[category] > 0 &&
        categoryCounts[category] !== plan.categoryRequirements[category]) {
      invalidPlan("plan target categories do not meet categoryRequirements");
    }
  }
}

export function savePlan(storage, plan) {
  assertStoredPlan(plan);
  try {
    storage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
  } catch {
    throw new AppError(
      "PERSISTENCE_UNAVAILABLE",
      "The observing plan is active for this page but could not be stored.",
    );
  }
  return plan;
}

export function loadPlan(storage) {
  try {
    const raw = storage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return null;
    const plan = JSON.parse(raw);
    assertStoredPlan(plan);
    return plan;
  } catch {
    return null;
  }
}

export function clearPlan(storage) {
  try {
    storage.removeItem(PLAN_STORAGE_KEY);
  } catch {
    throw new AppError("PERSISTENCE_UNAVAILABLE", "The saved observing plan could not be removed.");
  }
}
