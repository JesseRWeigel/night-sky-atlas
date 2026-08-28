import { AppError } from "./app-error.js";

export const PLAN_STORAGE_KEY = "night-sky-observing-plan:v1";

const TARGET_CATEGORIES = new Set(["planet", "bright_star", "deep_sky"]);
const TARGET_STATUSES = new Set(["upcoming", "current", "complete"]);

function invalidPlan(message) {
  throw new AppError("INVALID_PLAN", message);
}

function validDate(value) {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(new Date(value).getTime());
}

function assertStoredPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    invalidPlan("plan must be an object");
  }
  if (plan.version !== 1) invalidPlan("plan.version must be 1");
  if (plan.status !== "saved") invalidPlan("plan.status must be saved");
  if (typeof plan.id !== "string" || plan.id.trim() === "") invalidPlan("plan.id must be non-empty");
  if (typeof plan.title !== "string" || plan.title.trim() === "") invalidPlan("plan.title must be non-empty");
  if (!Number.isFinite(plan.durationMinutes) || plan.durationMinutes <= 0) {
    invalidPlan("plan.durationMinutes must be finite and positive");
  }

  const context = plan.context;
  if (!context || typeof context !== "object" || Array.isArray(context) ||
      !validDate(context.date) ||
      !Number.isFinite(context.latitude) || context.latitude < -90 || context.latitude > 90 ||
      !Number.isFinite(context.longitude) || context.longitude < -180 || context.longitude > 180 ||
      (context.locationName !== undefined && typeof context.locationName !== "string")) {
    invalidPlan("plan.context must contain a valid date and coordinates");
  }

  if (!Array.isArray(plan.targets) || plan.targets.length < 1 || plan.targets.length > 12) {
    invalidPlan("plan.targets must contain one to twelve targets");
  }
  if (!Number.isInteger(plan.currentIndex) || plan.currentIndex < -1 || plan.currentIndex >= plan.targets.length) {
    invalidPlan("plan.currentIndex is outside the target range");
  }

  const targetIds = new Set();
  for (const target of plan.targets) {
    if (!target || typeof target !== "object" || Array.isArray(target) ||
        typeof target.targetId !== "string" || target.targetId.trim() === "" || targetIds.has(target.targetId) ||
        typeof target.name !== "string" || target.name.trim() === "" ||
        !TARGET_CATEGORIES.has(target.category) ||
        !Number.isInteger(target.startOffsetMinutes) || target.startOffsetMinutes < 0 ||
        !Number.isInteger(target.durationMinutes) || target.durationMinutes < 1 ||
        !validDate(target.scheduledTime) ||
        !Number.isFinite(target.altitude) || !Number.isFinite(target.azimuth) ||
        !Number.isFinite(target.minimumAltitude) ||
        !TARGET_STATUSES.has(target.status)) {
      invalidPlan("plan target has an invalid structural shape");
    }
    targetIds.add(target.targetId);
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
