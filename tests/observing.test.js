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
  assert.equal(validateObservingPlan(preview, catalog), preview);
});

test("plan preview rejects target counts that cannot receive a positive minute slot", () => {
  const sourceCatalog = buildCatalogAt(NYC.date);
  const vega = sourceCatalog.find((target) => target.id === "star-vega");
  const catalog = Array.from({ length: 11 }, (_, index) => ({
    ...vega,
    id: `test-planet-${index + 1}`,
    name: `Test planet ${index + 1}`,
    isSolarSystem: true,
  }));

  assert.throws(
    () => previewObservingPlan(catalog, {
      previewId: "preview-too-crowded",
      title: "Too many stops",
      audience: "general",
      durationMinutes: 10,
      targetIds: catalog.map((target) => target.id),
      categoryRequirements: { planet: 0, bright_star: 0, deep_sky: 0 },
      minAltitude: 0,
      context: NYC,
      now: "2026-08-28T20:00:00.000Z",
    }),
    (error) => error.code === "INVALID_INPUT" && /durationMinutes/i.test(error.message),
  );
});

test("plan preview rejects Sun and other targets outside observable categories", () => {
  const midday = { ...NYC, date: "2026-08-29T17:00:00.000Z" };
  const catalog = buildCatalogAt(midday.date);
  const sun = catalog.find((target) => target.name === "Sun");

  assert.throws(
    () => previewObservingPlan(catalog, {
      previewId: "preview-sun",
      title: "Unsupported stop",
      audience: "general",
      durationMinutes: 10,
      targetIds: [sun.id],
      categoryRequirements: { planet: 0, bright_star: 0, deep_sky: 0 },
      minAltitude: 0,
      context: midday,
      now: "2026-08-28T20:00:00.000Z",
    }),
    (error) => error.code === "INVALID_INPUT" && /observable categor/i.test(error.message),
  );
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

function planetPlan(context, targetId, minAltitude = 0) {
  return previewObservingPlan(buildCatalogAt(context.date), {
    previewId: "planet-slot",
    title: "Planet slot",
    audience: "general",
    durationMinutes: 180,
    targetIds: [targetId],
    categoryRequirements: { planet: 1, bright_star: 0, deep_sky: 0 },
    minAltitude,
    context,
    now: NYC.date,
  });
}

function contextAtMinute(context, minutes) {
  return { ...context, date: new Date(Date.parse(context.date) + minutes * 60000).toISOString() };
}

test("planet slot uses each sample's ephemeris for its displayed position and minimum altitude", () => {
  const context = { ...NYC, date: "2026-08-29T19:00:00.000Z" };
  const id = "planet-mercury";
  const expected = [0, 90, 180].map((minute) => getTargetAtContext(id, contextAtMinute(context, minute)));
  const [target] = planetPlan(context, id).targets;

  assert.equal(target.altitude, expected[1].altitude);
  assert.equal(target.azimuth, expected[1].azimuth);
  assert.equal(target.minimumAltitude, Math.min(...expected.map((sample) => sample.altitude)));
});

test("planet altitude constraint does not accept a slot that goes below the threshold at its end", () => {
  const context = { ...NYC, date: "2026-09-05T18:00:00.000Z" };
  const id = "planet-venus";
  const minAltitude = 31.35;
  const end = getTargetAtContext(id, contextAtMinute(context, 180));
  assert.ok(end.altitude < minAltitude);

  assert.throws(
    () => planetPlan(context, id, minAltitude),
    (error) => error.code === "PLAN_CONSTRAINT_FAILED" && error.details.violations.some(
      (violation) => violation.reason === "MINIMUM_ALTITUDE" && violation.targetId === id &&
        violation.minimumAltitude === end.altitude,
    ),
  );
});

function dubhePlan(durationMinutes, minAltitude) {
  const context = { date: "2026-11-22T00:00:00.000Z", latitude: 40, longitude: -80 };
  return previewObservingPlan(buildCatalogAt(context.date), {
    previewId: "dubhe-slot",
    title: "Dubhe slot",
    audience: "general",
    durationMinutes,
    targetIds: ["star-dubhe"],
    categoryRequirements: { planet: 0, bright_star: 1, deep_sky: 0 },
    minAltitude,
    context,
    now: NYC.date,
  });
}

test("fixed-star slot rejects a lower culmination missed by all three sampled times", () => {
  assert.throws(
    () => dubhePlan(180, 11.8),
    (error) => error.code === "PLAN_CONSTRAINT_FAILED" && error.details.violations.some(
      (violation) => violation.reason === "MINIMUM_ALTITUDE" &&
        violation.targetId === "star-dubhe" &&
        Math.abs(violation.minimumAltitude - 11.751) < 1e-9,
    ),
  );
});

test("fixed-star slot reports lower culmination only if it falls inside the slot", () => {
  const entire = dubhePlan(180, 11.7).targets[0];
  assert.ok(Math.abs(entire.minimumAltitude - 11.751) < 1e-9);
  const short = dubhePlan(10, 11.77).targets[0];
  const atEnd = getTargetAtContext("star-dubhe", {
    date: "2026-11-22T00:10:00.000Z", latitude: 40, longitude: -80,
  });
  assert.equal(short.minimumAltitude, atEnd.altitude);
});
