import { AppError } from "./app-error.js";
import { validateObservingPlan } from "./observing.js";

export const PORTABLE_PLAN_FORMAT = "night-sky-atlas/plan-recipe";
const MAX_JSON_LENGTH = 4096;
const AUDIENCES = new Set(["child", "beginner", "general", "experienced"]);
const CATEGORIES = ["planet", "bright_star", "deep_sky"];
const KEYS = [
  "format", "version", "startTimeUtc", "audience", "durationMinutes", "targetIds",
  "categoryRequirements",
];

function invalid(message) {
  return new AppError("INVALID_PORTABLE_PLAN", message);
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isCanonicalUtcInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

// This is an inert recipe, not a saved plan; applying it requires a new local preview.
export function decodePortablePlan(json) {
  if (typeof json !== "string" || json.length > MAX_JSON_LENGTH) {
    throw invalid("Expected a portable plan JSON document of at most 4096 characters.");
  }
  let recipe;
  try {
    recipe = JSON.parse(json);
  } catch {
    throw invalid("The portable plan is not valid JSON.");
  }

  if (recipe?.format !== PORTABLE_PLAN_FORMAT) throw invalid("Unrecognized portable plan format.");
  if (recipe.version !== 1) {
    throw new AppError("UNSUPPORTED_PORTABLE_PLAN_VERSION", "This portable plan version is not supported.");
  }
  if (!exactKeys(recipe, KEYS) || !isCanonicalUtcInstant(recipe.startTimeUtc) ||
      !AUDIENCES.has(recipe.audience) ||
      !Number.isInteger(recipe.durationMinutes) || recipe.durationMinutes < 10 || recipe.durationMinutes > 180 ||
      !Array.isArray(recipe.targetIds) || recipe.targetIds.length < 1 || recipe.targetIds.length > 12 ||
      recipe.targetIds.length > recipe.durationMinutes ||
      recipe.targetIds.some((id) => typeof id !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(id)) ||
      new Set(recipe.targetIds).size !== recipe.targetIds.length ||
      !exactKeys(recipe.categoryRequirements, CATEGORIES) ||
      CATEGORIES.some((key) => !Number.isInteger(recipe.categoryRequirements[key]) ||
        recipe.categoryRequirements[key] < 0 || recipe.categoryRequirements[key] > 12) ||
      CATEGORIES.reduce((sum, key) => sum + recipe.categoryRequirements[key], 0) > recipe.targetIds.length) {
    throw invalid("The portable plan contains unsupported fields or invalid plan values.");
  }
  return recipe;
}

export function encodePortablePlan(plan, catalog) {
  const source = validateObservingPlan(plan, catalog);
  const recipe = {
    format: PORTABLE_PLAN_FORMAT,
    version: 1,
    startTimeUtc: new Date(source.context.date).toISOString(),
    audience: source.audience,
    durationMinutes: source.durationMinutes,
    targetIds: source.targets.map(({ targetId }) => targetId),
    categoryRequirements: Object.fromEntries(CATEGORIES.map((key) => [key, source.categoryRequirements[key] ?? 0])),
  };
  const json = JSON.stringify(recipe, null, 2);
  decodePortablePlan(json);
  return json;
}
