import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCatalogAt,
  findObservableTargets,
  getTargetAtContext,
  previewObservingPlan,
  targetCategory,
  validateObservingPlan,
} from "../src/observing.js";

const NYC = {
  date: "2026-08-29T01:00:00.000Z",
  latitude: 40.7128,
  longitude: -74.006,
  locationName: "New York City",
};

test("dynamic planets have stable ids and planet categories", () => {
  const catalog = buildCatalogAt(NYC.date);
  const jupiter = catalog.find((target) => target.id === "planet-jupiter");
  assert.equal(jupiter.name, "Jupiter");
  assert.equal(targetCategory(jupiter), "planet");
  assert.equal(targetCategory(catalog.find((target) => target.name === "Sun")), null);
  assert.equal(targetCategory(catalog.find((target) => target.name === "Moon")), null);
});

test("target context returns observable coordinates without mutating the catalog", () => {
  const catalog = buildCatalogAt(NYC.date);
  const before = structuredClone(catalog);
  const target = getTargetAtContext("star-vega", NYC, catalog);
  assert.equal(target.id, "star-vega");
  assert.ok(Number.isFinite(target.altitude));
  assert.ok(Number.isFinite(target.azimuth));
  assert.deepEqual(catalog, before);
});

test("target context rejects null or missing contexts with an app error", () => {
  for (const context of [null, undefined]) {
    assert.throws(
      () => getTargetAtContext("star-vega", context),
      (error) => error.code === "INVALID_INPUT",
    );
  }
});

test("observable target search honors category, magnitude, altitude, and limit", () => {
  const catalog = buildCatalogAt(NYC.date);
  const results = findObservableTargets(catalog, NYC, {
    categories: ["bright_star"],
    minAltitude: 20,
    maxMagnitude: 1.5,
    limit: 3,
  });
  assert.ok(results.length > 0 && results.length <= 3);
  assert.ok(results.every((target) =>
    target.category === "bright_star" &&
    target.altitude >= 20 &&
    target.magnitude <= 1.5
  ));
  assert.deepEqual(results, [...results].sort((a, b) =>
    b.altitude - a.altitude || a.magnitude - b.magnitude
  ));
});

test("observable target search rejects duplicate or unsupported categories", () => {
  const catalog = buildCatalogAt(NYC.date);
  assert.throws(
    () => findObservableTargets(catalog, NYC, {
      categories: ["planet", "planet"],
      minAltitude: 0,
      limit: 5,
    }),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("observable target search rejects fractional limits", () => {
  const catalog = buildCatalogAt(NYC.date);
  assert.throws(
    () => findObservableTargets(catalog, NYC, {
      categories: ["bright_star"],
      minAltitude: 0,
      limit: 1.5,
    }),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("plan preview allocates exact duration and enforces category counts", () => {
  const catalog = buildCatalogAt(NYC.date);
  const chosen = ["planet", "bright_star", "deep_sky"]
    .map((category) => findObservableTargets(catalog, NYC, {
      categories: [category],
      minAltitude: 0,
      limit: 1,
    })[0].id);
  const preview = previewObservingPlan(catalog, {
    previewId: "preview-test",
    title: "Three stops",
    audience: "child",
    notes: "Use plain-language descriptions.",
    durationMinutes: 31,
    targetIds: chosen,
    categoryRequirements: { planet: 1, bright_star: 1, deep_sky: 1 },
    minAltitude: 0,
    context: NYC,
    now: "2026-08-28T20:00:00.000Z",
  });
  assert.equal(preview.id, "preview-test");
  assert.deepEqual(preview.targets.map((target) => target.durationMinutes), [11, 10, 10]);
  assert.equal(preview.targets.reduce((sum, target) => sum + target.durationMinutes, 0), 31);
  assert.ok(preview.targets.every((target) => target.minimumAltitude >= 0));
});

test("plan preview reports altitude constraint failures atomically", () => {
  const catalog = buildCatalogAt(NYC.date);
  assert.throws(
    () => previewObservingPlan(catalog, {
      previewId: "preview-impossible",
      title: "Impossible plan",
      audience: "general",
      durationMinutes: 30,
      targetIds: ["star-canopus"],
      categoryRequirements: { planet: 0, bright_star: 1, deep_sky: 0 },
      minAltitude: 89,
      context: NYC,
      now: "2026-08-28T20:00:00.000Z",
    }),
    (error) => error.code === "PLAN_CONSTRAINT_FAILED" && error.details.violations.length === 1,
  );
});

test("persisted plans reject nonzero category quota mismatches", () => {
  const catalog = buildCatalogAt(NYC.date);
  const targetId = findObservableTargets(catalog, NYC, {
    categories: ["bright_star"],
    minAltitude: 0,
    limit: 1,
  })[0].id;
  const plan = previewObservingPlan(catalog, {
    previewId: "preview-validation",
    title: "Validation plan",
    audience: "general",
    durationMinutes: 10,
    targetIds: [targetId],
    categoryRequirements: { planet: 0, bright_star: 1, deep_sky: 0 },
    minAltitude: 0,
    context: NYC,
    now: "2026-08-28T20:00:00.000Z",
  });
  assert.throws(
    () => validateObservingPlan({
      ...plan,
      categoryRequirements: { planet: 1, bright_star: 0, deep_sky: 0 },
    }, catalog),
    (error) => error.code === "INVALID_INPUT",
  );
});
