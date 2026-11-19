import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogAt, previewObservingPlan } from "../src/observing.js";
import { decodePortablePlan, encodePortablePlan } from "../src/portable-plan.js";

const context = {
  date: "2026-08-29T01:00:00.000Z",
  latitude: 40.7128,
  longitude: -74.006,
  locationName: "Synthetic location",
};
const catalog = buildCatalogAt(context.date);
const current = previewObservingPlan(catalog, {
  context, previewId: "browser-local-id", now: context.date,
  title: "Private title", notes: "Private notes", audience: "general",
  durationMinutes: 25, targetIds: ["star-vega", "star-deneb"],
  minAltitude: 0, categoryRequirements: { planet: 0, bright_star: 2, deep_sky: 0 },
});

test("portable recipe carries schedule and ordered IDs but serializes no private fields or derived location data", () => {
  const source = structuredClone(current);
  source.context.private = { latitude: 1, longitude: 2, notes: "Nested private context" };
  source.targets[0].private = { notes: "Nested private target" };
  const before = structuredClone(source);
  const json = encodePortablePlan(source, catalog);
  assert.deepEqual(JSON.parse(json), {
    format: "night-sky-atlas/plan-recipe",
    version: 1,
    startTimeUtc: context.date,
    audience: "general",
    durationMinutes: 25,
    targetIds: ["star-vega", "star-deneb"],
    categoryRequirements: { planet: 0, bright_star: 2, deep_sky: 0 },
  });
  assert.doesNotMatch(json, /40\.7128|-74\.006|Private|Nested|Synthetic location|browser-local-id|minimumAltitude|azimuth/i);
  assert.deepEqual(source, before);
});

test("decoded recipe can reproduce IDs and slots with the existing planner and caller-supplied location", () => {
  const recipe = decodePortablePlan(encodePortablePlan(current, catalog));
  const replica = previewObservingPlan(catalog, {
    context: { ...context, date: recipe.startTimeUtc }, previewId: "fresh-id",
    now: recipe.startTimeUtc, title: "Shared plan", audience: recipe.audience,
    durationMinutes: recipe.durationMinutes, targetIds: recipe.targetIds,
    categoryRequirements: recipe.categoryRequirements, minAltitude: 0,
  });
  const slots = (plan) => plan.targets.map(({ targetId, scheduledTime }) => [targetId, scheduledTime]);
  assert.deepEqual(slots(replica), slots(current));
  assert.notEqual(replica.id, current.id);
});

test("malformed or hostile imports fail without mutating an active plan or catalog", () => {
  const json = encodePortablePlan(current, catalog);
  const good = JSON.parse(json);
  const priorPlan = structuredClone(current);
  const priorCatalog = structuredClone(catalog);
  const invalid = [
    null, "{}", "{broken", " ".repeat(4097),
    json.replace(/}$/, ',"__proto__":{"polluted":true}}'),
    JSON.stringify({ ...good, notes: "extra" }),
    JSON.stringify({ ...good, context: { latitude: 1 } }),
    JSON.stringify({ ...good, startTimeUtc: "2026-02-30T01:00:00.000Z" }),
    JSON.stringify({ ...good, startTimeUtc: "2026-08-29T01:00:00" }),
    JSON.stringify({ ...good, targetIds: ["star-vega", "star-vega"] }),
    JSON.stringify({ ...good, categoryRequirements: { ...good.categoryRequirements, planet: 1 } }),
    JSON.stringify({ ...good, categoryRequirements: { ...good.categoryRequirements, notes: "extra" } }),
  ];
  for (const candidate of invalid) {
    assert.throws(() => decodePortablePlan(candidate), { code: "INVALID_PORTABLE_PLAN" });
  }
  assert.throws(
    () => decodePortablePlan(JSON.stringify({ ...good, version: 2 })),
    { code: "UNSUPPORTED_PORTABLE_PLAN_VERSION" },
  );
  assert.deepEqual(current, priorPlan);
  assert.deepEqual(catalog, priorCatalog);
  assert.equal({}.polluted, undefined);
});

test("export rejects targets that are not in the supplied catalog", () => {
  assert.throws(() => encodePortablePlan(current, []), { code: "TARGET_NOT_FOUND" });
});
