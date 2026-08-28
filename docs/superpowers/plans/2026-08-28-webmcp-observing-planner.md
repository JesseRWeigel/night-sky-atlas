# WebMCP Observing Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a visible, locally persisted observing-plan and tour experience whose human controls and ten WebMCP tools operate the same Night Sky Atlas state.

**Architecture:** Add pure observing-plan logic, versioned persistence, and a reusable application-action factory around the existing mutable state. Keep canvas rendering and DOM effects in src/app.js, render the plan rail through a focused UI module, and register imperative top-level WebMCP tools through a separately testable adapter.

**Tech Stack:** Browser-native JavaScript ES modules, HTML, CSS, Canvas 2D, localStorage, document.modelContext.registerTool(), Node.js built-in test runner, Python static server, GitHub Pages.

**Spec:** docs/superpowers/specs/2026-08-28-webmcp-observing-planner-design.md

## Global Constraints

- Preserve static deployment with browser-native ES modules; add no backend, API key, paid service, framework migration, package dependency, or build step.
- Register all ten tools imperatively from the top-level page and guard WebMCP absence.
- Use narrow JSON Schemas with additionalProperties: false, bounded values, enums, and accurate readOnlyHint annotations.
- Keep normal search, canvas, inspector, time, location, layers, deep survey, and WebXR behavior working.
- Every state-changing action must cause an observable page change and return enough data to verify it.
- Do not push, deploy, publish, upload, or submit without explicit user approval.
- Preserve baseline commit 81672ede79762cbf3aadfe23a8dc9eee32013f94 in the before-versus-after documentation.
- Use test-first red/green/refactor cycles for every production behavior.

## File Map

- Create src/app-error.js: stable AppError type and expected-error serialization.
- Create src/observing.js: catalog-at-time construction, target categorization, observability filtering, slot allocation, and plan validation.
- Create src/plan-store.js: versioned localStorage serialization.
- Create src/app-actions.js: shared read and mutation actions over the live application state.
- Create src/webmcp.js: ten tool definitions, handler translation, registration, and graceful feature detection.
- Create src/plan-ui.js: pure plan markup plus DOM event delegation and focus behavior.
- Create plan.css: planner rail, constellation thread, forms, progress, responsive layout, and reduced motion.
- Modify src/app.js: instantiate actions, replace overlapping direct mutations, connect effects, restore the plan, mount the UI, and register WebMCP.
- Modify index.html: load plan.css and add plan toggle, rail, live status, and Add to plan control.
- Modify package.json: add a deterministic static syntax/check command while retaining the existing test command.
- Create tests/observing.test.js, tests/plan-store.test.js, tests/app-actions.test.js, tests/webmcp.test.js, tests/plan-ui.test.js, and tests/static.test.js.
- Modify README.md and create docs/submission/devpost.md, docs/submission/demo.md, docs/submission/checklist.md, and docs/submission/attribution.md.

---

### Task 1: Observing domain and validation errors

**Files:**
- Create: src/app-error.js
- Create: src/observing.js
- Test: tests/observing.test.js

**Interfaces:**
- Consumes: equatorialToHorizontal() and solarSystemPositions() from src/astronomy.js; CATALOG, DEEP_SKY, SOLAR_SYSTEM_INFO, and STARS from src/catalog.js.
- Produces: AppError, serializeAppError(), buildCatalogAt(), targetCategory(), getTargetAtContext(), findObservableTargets(), previewObservingPlan(), and validateObservingPlan().

- [ ] **Step 1: Write failing category, catalog, and target-context tests**

~~~js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCatalogAt,
  getTargetAtContext,
  targetCategory,
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
~~~

- [ ] **Step 2: Run the focused tests and verify the module is missing**

Run: npm test -- --test-name-pattern="dynamic planets|target context"

Expected: FAIL with ERR_MODULE_NOT_FOUND for src/observing.js.

- [ ] **Step 3: Implement AppError, catalog construction, categorization, context normalization, and target lookup**

~~~js
// src/app-error.js
export class AppError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function serializeAppError(error) {
  if (!(error instanceof AppError)) throw error;
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}
~~~

In src/observing.js, implement the following concrete contracts:

~~~js
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
~~~

parseIsoDate() must reject invalid dates with AppError code INVALID_INPUT. normalizeContext() must validate latitude -90..90 and longitude -180..180. getTargetAtContext(targetId, context, catalog = buildCatalogAt(context.date)) must throw TARGET_NOT_FOUND for an unknown ID and return id, name, category, magnitude, altitude, azimuth, ra, and dec.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: npm test -- --test-name-pattern="dynamic planets|target context"

Expected: 2 passing tests.

- [ ] **Step 5: Write failing observable-target filter tests**

~~~js
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
~~~

- [ ] **Step 6: Run the filter tests and verify the missing function failure**

Run: npm test -- --test-name-pattern="observable target search"

Expected: FAIL because findObservableTargets is not exported.

- [ ] **Step 7: Implement filter validation and deterministic sorting**

findObservableTargets(catalog, context, filters) must:

1. Require 1–3 unique categories drawn from planet, bright_star, and deep_sky.
2. Validate minAltitude 0..90, maxMagnitude -30..15 when present, and limit 1..12.
3. Derive target context for each categorizable object.
4. Filter by requested category, minimum altitude, and optional maximum magnitude.
5. Sort by altitude descending, then finite magnitude ascending, then name.
6. Return at most limit summaries and throw NO_OBSERVABLE_TARGETS when empty.

- [ ] **Step 8: Run the filter tests and full baseline suite**

Run: npm test

Expected: all 11 existing tests plus new observing tests pass.

- [ ] **Step 9: Write failing plan allocation and constraint tests**

~~~js
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
~~~

- [ ] **Step 10: Run the plan tests and verify the missing function failure**

Run: npm test -- --test-name-pattern="plan preview"

Expected: FAIL because previewObservingPlan is not exported.

- [ ] **Step 11: Implement slot allocation, start/mid/end sampling, quotas, and persisted-plan validation**

previewObservingPlan(catalog, request) must validate:

- title 1..90 characters, audience enum, notes at most 500 characters;
- durationMinutes 10..180, 1..12 unique target IDs, minAltitude 0..90;
- integer categoryRequirements keys planet, bright_star, deep_sky within 0..12;
- exact nonzero category counts;
- each slot's start, midpoint, and end altitude at or above minAltitude.

It must return version 1, status preview, currentIndex -1, createdAt/updatedAt from request.now, context normalized to an ISO date, and target records with scheduledTime, altitude, azimuth, minimumAltitude, and upcoming status. validateObservingPlan(plan, catalog) must accept preview or saved status, validate the structural shape, and confirm every target ID exists.

- [ ] **Step 12: Run all tests, refactor shared validators, and commit**

Run: npm test

Expected: all tests pass with no warnings.

~~~bash
git add src/app-error.js src/observing.js tests/observing.test.js
git commit -m "feat: add observing plan domain logic"
~~~

---

### Task 2: Versioned observing-plan persistence

**Files:**
- Create: src/plan-store.js
- Test: tests/plan-store.test.js

**Interfaces:**
- Consumes: AppError from src/app-error.js.
- Produces: PLAN_STORAGE_KEY, savePlan(storage, plan), loadPlan(storage), and clearPlan(storage).

- [ ] **Step 1: Write failing round-trip, malformed-data, version, and storage-failure tests**

~~~js
import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_STORAGE_KEY,
  clearPlan,
  loadPlan,
  savePlan,
} from "../src/plan-store.js";

const validPlan = {
  version: 1,
  id: "plan-1",
  title: "Test plan",
  audience: "general",
  notes: "",
  durationMinutes: 10,
  categoryRequirements: { planet: 0, bright_star: 1, deep_sky: 0 },
  context: {
    date: "2026-08-29T01:00:00.000Z",
    latitude: 40.7128,
    longitude: -74.006,
    locationName: "New York City",
  },
  status: "saved",
  currentIndex: -1,
  createdAt: "2026-08-28T20:00:00.000Z",
  updatedAt: "2026-08-28T20:00:00.000Z",
  targets: [{
    targetId: "star-vega",
    name: "Vega",
    category: "bright_star",
    startOffsetMinutes: 0,
    durationMinutes: 10,
    scheduledTime: "2026-08-29T01:00:00.000Z",
    altitude: 40,
    azimuth: 80,
    minimumAltitude: 39,
    status: "upcoming",
  }],
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("plan persistence round-trips and clears only its versioned key", () => {
  const storage = memoryStorage();
  storage.setItem("unrelated", "keep");
  savePlan(storage, validPlan);
  assert.deepEqual(loadPlan(storage), validPlan);
  clearPlan(storage);
  assert.equal(storage.getItem(PLAN_STORAGE_KEY), null);
  assert.equal(storage.getItem("unrelated"), "keep");
});

test("plan loading ignores malformed and obsolete data", () => {
  const storage = memoryStorage();
  storage.setItem(PLAN_STORAGE_KEY, "{bad json");
  assert.equal(loadPlan(storage), null);
  storage.setItem(PLAN_STORAGE_KEY, JSON.stringify({ ...validPlan, version: 2 }));
  assert.equal(loadPlan(storage), null);
});

test("plan saving reports unavailable persistence", () => {
  const storage = { setItem() { throw new Error("denied"); } };
  assert.throws(
    () => savePlan(storage, validPlan),
    (error) => error.code === "PERSISTENCE_UNAVAILABLE",
  );
});
~~~

- [ ] **Step 2: Run the persistence tests and verify the module is missing**

Run: node --test tests/plan-store.test.js

Expected: FAIL with ERR_MODULE_NOT_FOUND.

- [ ] **Step 3: Implement structural validation and isolated storage operations**

~~~js
export const PLAN_STORAGE_KEY = "night-sky-observing-plan:v1";

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
~~~

assertStoredPlan() must require version 1, saved status, nonempty id/title, a finite duration, valid context, currentIndex from -1 through targets.length - 1, and 1–12 structurally complete targets.

- [ ] **Step 4: Run persistence and full tests, then commit**

Run: npm test

Expected: all tests pass.

~~~bash
git add src/plan-store.js tests/plan-store.test.js
git commit -m "feat: persist observing plans locally"
~~~

---

### Task 3: Shared application actions

**Files:**
- Create: src/app-actions.js
- Test: tests/app-actions.test.js

**Interfaces:**
- Consumes: AppError; observing-domain exports; savePlan(); equatorialToHorizontal(); clamp().
- Produces: createAppActions({ state, storage, effects, now, createId }) returning the fifteen methods specified in the design.

- [ ] **Step 1: Write the failing action-harness tests for read operations and observer mutations**

~~~js
import test from "node:test";
import assert from "node:assert/strict";
import { createAppActions } from "../src/app-actions.js";

function harness() {
  const changes = [];
  const stored = new Map();
  const state = {
    date: new Date("2026-08-29T01:00:00.000Z"),
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
    layers: { stars: true, objects: true, constellations: true, grid: true, labels: true },
    survey: "auto",
    plan: null,
    planPreview: null,
    planPanelOpen: false,
    tour: { active: false, currentIndex: -1 },
  };
  const actions = createAppActions({
    state,
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key),
    },
    effects: { onStateChanged: (change) => changes.push(change) },
    now: () => "2026-08-28T20:00:00.000Z",
    createId: (prefix) => prefix + "-fixed",
  });
  return { actions, changes, state, stored };
}

test("sky context and target detail actions do not emit mutations", () => {
  const { actions, changes } = harness();
  const context = actions.getSkyContext();
  const vega = actions.getTargetDetails("star-vega");
  assert.equal(context.location.name, "New York City");
  assert.equal(vega.target.id, "star-vega");
  assert.deepEqual(changes, []);
});

test("observer actions validate first and emit one visible change", () => {
  const { actions, changes, state } = harness();
  const location = actions.setObserverLocation({
    latitude: 51.5074,
    longitude: -0.1278,
    locationName: "London",
  });
  assert.equal(location.location.name, "London");
  assert.equal(state.locationName, "London");
  assert.equal(changes.at(-1).type, "observer-location");
  actions.setObserverTime({ isoTime: "2026-08-29T02:00:00.000Z" });
  assert.equal(state.playing, false);
  assert.equal(changes.at(-1).type, "observer-time");
  const snapshot = structuredClone(state);
  assert.throws(
    () => actions.setObserverLocation({ latitude: 100, longitude: 0, locationName: "Bad" }),
    (error) => error.code === "INVALID_INPUT",
  );
  assert.deepEqual(state, snapshot);
});
~~~

- [ ] **Step 2: Run the action tests and verify the module is missing**

Run: node --test tests/app-actions.test.js

Expected: FAIL with ERR_MODULE_NOT_FOUND.

- [ ] **Step 3: Implement the factory, read actions, mutation transaction helper, location persistence, and time mutation**

~~~js
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
  // Return the complete method object listed below.
}
~~~

getSkyContext() must return time, location, view, layers, survey, selected target summary, and plan summary. findObservableTargets(filters) maps snake-free application inputs to the domain function. getTargetDetails(targetId, atTime) returns scientific catalog fields and derived horizontal coordinates. setObserverLocation() validates before mutating, writes the existing night-sky-location key, emits observer-location, and returns prior/current locations. setObserverTime() validates the ISO date, pauses playback, sets lastCatalogUpdate to 0 when present, emits observer-time, and returns prior/current times.

- [ ] **Step 4: Run the focused action tests and verify they pass**

Run: node --test tests/app-actions.test.js

Expected: 2 passing tests.

- [ ] **Step 5: Write failing framing and layer-configuration tests**

~~~js
test("framing and layer actions update shared state and report the change", () => {
  const { actions, changes, state } = harness();
  const frame = actions.frameTarget({ targetId: "star-vega", fieldOfView: 12 });
  assert.equal(state.selected.id, "star-vega");
  assert.equal(state.fov, 12);
  assert.equal(frame.target.id, "star-vega");
  assert.equal(changes.at(-1).type, "target-framed");
  const layers = actions.configureLayers({ grid: false, labels: false, survey: "off" });
  assert.equal(state.layers.grid, false);
  assert.equal(state.layers.labels, false);
  assert.equal(state.survey, "off");
  assert.equal(layers.layers.stars, true);
  assert.equal(changes.at(-1).type, "layers-configured");
});

test("empty layer configuration is rejected without mutation", () => {
  const { actions, state } = harness();
  const snapshot = structuredClone(state);
  assert.throws(
    () => actions.configureLayers({}),
    (error) => error.code === "INVALID_INPUT",
  );
  assert.deepEqual(state, snapshot);
});
~~~

- [ ] **Step 6: Run framing/layer tests and verify the functions fail**

Run: npm test -- --test-name-pattern="framing|layer"

Expected: FAIL because frameTarget or configureLayers is missing.

- [ ] **Step 7: Implement framing and layer mutations**

frameTarget({ targetId, fieldOfView }) must resolve the catalog at state.date, choose the existing default FOV rule when fieldOfView is absent, update center RA/Dec below the 28° survey threshold or center azimuth/altitude otherwise, select the object, and emit target-framed. configureLayers(input) must accept at least one of stars, objects, constellations, grid, labels, or survey; validate booleans and the survey enum auto/dss/panstarrs/2mass/off before applying one atomic mutation.

- [ ] **Step 8: Run focused and full tests**

Run: npm test

Expected: all tests pass.

- [ ] **Step 9: Write failing preview/save/manual-edit/tour tests**

~~~js
test("preview and save preserve observer context until an explicit observer action", () => {
  const { actions, changes, state } = harness();
  const candidates = actions.findObservableTargets({
    categories: ["bright_star"],
    minAltitude: 0,
    limit: 1,
  });
  const preview = actions.previewPlan({
    title: "Preview first",
    audience: "child",
    notes: "",
    durationMinutes: 10,
    targetIds: [candidates.targets[0].id],
    categoryRequirements: { planet: 0, bright_star: 1, deep_sky: 0 },
    minAltitude: 0,
    startTime: "2026-08-29T01:00:00.000Z",
    observer: {
      latitude: 51.5074,
      longitude: -0.1278,
      locationName: "London",
    },
  });
  assert.equal(state.locationName, "New York City");
  assert.equal(state.planPreview.context.locationName, "London");
  assert.equal(changes.at(-1).type, "plan-previewed");
  const saved = actions.savePlan({ previewId: preview.preview.id });
  assert.equal(state.plan.status, "saved");
  assert.equal(state.locationName, "New York City");
  assert.equal(saved.plan.id, "plan-fixed");
});

test("tour rejects location mismatch before mutating progress", () => {
  const { actions, state } = harness();
  actions.createManualPlan({ title: "Manual", audience: "general", durationMinutes: 10 });
  actions.addTargetToPlan("star-vega");
  state.planPreview.context.latitude = 51.5074;
  state.planPreview.context.longitude = -0.1278;
  actions.savePlan({ previewId: state.planPreview.id });
  const snapshot = structuredClone(state);
  assert.throws(
    () => actions.advanceTour({ direction: "start" }),
    (error) => error.code === "LOCATION_MISMATCH",
  );
  assert.deepEqual(state, snapshot);
});
~~~

- [ ] **Step 10: Run planning-action tests and verify the functions fail**

Run: npm test -- --test-name-pattern="preview and save|tour rejects"

Expected: FAIL because planning actions are missing.

- [ ] **Step 11: Implement planning actions and progress transitions**

Implement:

- previewPlan(): creates preview-fixed through createId("preview"), calls previewObservingPlan(), stores state.planPreview, opens the panel, and emits plan-previewed.
- savePlan(): requires the current preview ID, clones the preview as status saved with createId("plan"), validates it, persists it, stores state.plan, clears state.planPreview, and emits plan-saved. If persistence throws PERSISTENCE_UNAVAILABLE, keep state.plan and emit plan-save-memory-only before rethrowing.
- createManualPlan(): creates a manual preview with no targets, default minAltitude 20, and source manual. Empty manual drafts are allowed only in application state, not through previewObservingPlan().
- addTargetToPlan(), updatePlan(), removeTargetFromPlan(), and movePlanTarget(): rebuild a nonempty preview through previewObservingPlan() after each edit; duplicate IDs emit plan-target-duplicate without changing target order.
- advanceTour(): requires a saved plan, accepts exactly one of direction or targetIndex, validates matching coordinates within 0.0001°, rejects boundaries, updates target statuses/currentIndex, sets state.date and selected/framing fields, opens the panel, and emits tour-advanced.

- [ ] **Step 12: Add tests for manual edit ordering, stale preview, tour boundary, and successful advancement**

~~~js
test("manual target edits and tour advancement share the saved plan state", () => {
  const { actions, changes, state } = harness();
  actions.createManualPlan({ title: "Manual", audience: "general", durationMinutes: 20 });
  actions.addTargetToPlan("star-vega");
  actions.addTargetToPlan("star-arcturus");
  actions.movePlanTarget({ targetId: "star-arcturus", direction: "earlier" });
  assert.deepEqual(state.planPreview.targets.map((target) => target.targetId), [
    "star-arcturus",
    "star-vega",
  ]);
  actions.savePlan({ previewId: state.planPreview.id });
  const result = actions.advanceTour({ direction: "start" });
  assert.equal(result.tour.currentIndex, 0);
  assert.equal(state.selected.id, "star-arcturus");
  assert.equal(state.playing, false);
  assert.equal(changes.at(-1).type, "tour-advanced");
  assert.throws(
    () => actions.savePlan({ previewId: "stale" }),
    (error) => error.code === "PLAN_PREVIEW_NOT_FOUND",
  );
});
~~~

- [ ] **Step 13: Run all tests, refactor duplicated plan rebuilds, and commit**

Run: npm test

Expected: all tests pass with action failures leaving deep-equal state snapshots.

~~~bash
git add src/app-actions.js tests/app-actions.test.js
git commit -m "feat: share atlas application actions"
~~~

---

### Task 4: WebMCP tool definitions and mock harness

**Files:**
- Create: src/webmcp.js
- Test: tests/webmcp.test.js

**Interfaces:**
- Consumes: the createAppActions() method names and serializeAppError().
- Produces: createWebMcpTools(actions), registerWebMcpTools(modelContext, tools), and setupWebMcp(actions, documentLike).

- [ ] **Step 1: Write failing tool inventory, annotation, and schema tests**

~~~js
import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/app-error.js";
import { createWebMcpTools } from "../src/webmcp.js";

const methodNames = [
  "getSkyContext", "findObservableTargets", "getTargetDetails",
  "setObserverLocation", "setObserverTime", "frameTarget", "previewPlan",
  "savePlan", "advanceTour", "configureLayers",
];
const actions = Object.fromEntries(methodNames.map((name) => [name, (input = {}) => ({ name, input })]));

test("WebMCP exports the exact ten tools with accurate read-only annotations", () => {
  const tools = createWebMcpTools(actions);
  assert.deepEqual(tools.map((tool) => tool.name), [
    "get_sky_context",
    "find_observable_targets",
    "get_target_details",
    "set_observer_location",
    "set_observer_time",
    "frame_target",
    "preview_observing_plan",
    "save_observing_plan",
    "advance_observing_tour",
    "configure_sky_layers",
  ]);
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.ok(tool.title && tool.description);
  }
  assert.deepEqual(
    tools.filter((tool) => tool.annotations?.readOnlyHint).map((tool) => tool.name),
    ["get_sky_context", "find_observable_targets", "get_target_details"],
  );
});
~~~

- [ ] **Step 2: Run the inventory test and verify the module is missing**

Run: node --test tests/webmcp.test.js

Expected: FAIL with ERR_MODULE_NOT_FOUND.

- [ ] **Step 3: Implement all ten concrete definitions**

Each definition must include title, unambiguous imperative description, the exact snake_case schema from the spec, annotations, and an execute callback. The preview schema must require title, audience, duration_minutes, target_ids, category_requirements, and min_altitude; bound observer.location_name to 80 and notes to 500; set uniqueItems on target_ids and categories. advance_observing_tour must use oneOf to allow direction or target_index, not both.

Use these exact handler translations:

- get_sky_context calls actions.getSkyContext().
- find_observable_targets maps min_altitude, max_magnitude, at_time, and limit to minAltitude, maxMagnitude, atTime, and limit.
- get_target_details maps target_id and at_time to actions.getTargetDetails(targetId, atTime).
- set_observer_location maps latitude, longitude, and location_name to latitude, longitude, and locationName.
- set_observer_time maps iso_time to isoTime.
- frame_target maps target_id and field_of_view to targetId and fieldOfView.
- preview_observing_plan maps duration_minutes, target_ids, category_requirements, min_altitude, start_time, observer.location_name, and the remaining text fields to the previewPlan camelCase contract.
- save_observing_plan maps preview_id to previewId.
- advance_observing_tour maps direction or target_index to direction or targetIndex.
- configure_sky_layers passes the five booleans and survey through unchanged.

Use this handler pattern for every tool:

~~~js
const safe = (handler) => async (input) => {
  try {
    return { ok: true, ...handler(input) };
  } catch (error) {
    return serializeAppError(error);
  }
};

{
  name: "set_observer_location",
  title: "Set observer location",
  description: "Change the atlas observer coordinates and visibly update the sky. This does not alter a saved plan's proposed location.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      latitude: { type: "number", minimum: -90, maximum: 90 },
      longitude: { type: "number", minimum: -180, maximum: 180 },
      location_name: { type: "string", minLength: 1, maxLength: 80 },
    },
    required: ["latitude", "longitude", "location_name"],
  },
  annotations: { readOnlyHint: false, untrustedContentHint: false },
  execute: safe((input) => actions.setObserverLocation({
    latitude: input.latitude,
    longitude: input.longitude,
    locationName: input.location_name,
  })),
}
~~~

- [ ] **Step 4: Run inventory tests and add handler translation/error tests**

~~~js
test("tool handlers translate snake_case input and serialize expected errors", async () => {
  const calls = [];
  const translatedActions = {
    ...actions,
    setObserverTime(input) { calls.push(input); return { time: input.isoTime }; },
    getTargetDetails() {
      throw new AppError("TARGET_NOT_FOUND", "Target not found.", { targetId: "missing" });
    },
  };
  const tools = createWebMcpTools(translatedActions);
  const setTime = tools.find((tool) => tool.name === "set_observer_time");
  const success = await setTime.execute({ iso_time: "2026-08-29T01:00:00.000Z" });
  assert.equal(success.ok, true);
  assert.deepEqual(calls, [{ isoTime: "2026-08-29T01:00:00.000Z" }]);
});
~~~

- [ ] **Step 5: Write failing registration and absence tests**

~~~js
test("registration uses the supplied model context and absence is graceful", async () => {
  const registered = [];
  const modelContext = {
    async registerTool(tool) { registered.push(tool); },
  };
  const summary = await registerWebMcpTools(modelContext, createWebMcpTools(actions));
  assert.equal(summary.supported, true);
  assert.equal(summary.registered.length, 10);
  assert.equal(registered.length, 10);
  assert.deepEqual(await setupWebMcp(actions, {}), {
    supported: false,
    registered: [],
  });
});
~~~

- [ ] **Step 6: Implement sequential registration and guarded setup**

~~~js
export async function registerWebMcpTools(modelContext, tools) {
  const registered = [];
  for (const tool of tools) {
    await modelContext.registerTool(tool);
    registered.push(tool.name);
  }
  return { supported: true, registered };
}

export async function setupWebMcp(actions, documentLike = document) {
  if (typeof documentLike.modelContext?.registerTool !== "function") {
    return { supported: false, registered: [] };
  }
  return registerWebMcpTools(documentLike.modelContext, createWebMcpTools(actions));
}
~~~

- [ ] **Step 7: Run all tests and commit**

Run: npm test

Expected: exact ten-tool inventory, schemas, handlers, registration, and absence tests pass.

~~~bash
git add src/webmcp.js tests/webmcp.test.js
git commit -m "feat: expose atlas WebMCP tools"
~~~

---

### Task 5: Planner UI module and visual system

**Files:**
- Create: src/plan-ui.js
- Create: plan.css
- Modify: index.html:10, 23-44, 152-191
- Test: tests/plan-ui.test.js

**Interfaces:**
- Consumes: action methods createManualPlan(), updatePlan(), savePlan(), removeTargetFromPlan(), movePlanTarget(), advanceTour(); a getSnapshot() callback; an onClose() callback.
- Produces: renderPlanMarkup(snapshot), mountPlanUi({ root, toggle, status, actions, getSnapshot, onClose }), and an HTML/CSS shell used by src/app.js.

- [ ] **Step 1: Write failing pure markup tests for empty, preview, saved, and tour states**

~~~js
import test from "node:test";
import assert from "node:assert/strict";
import { renderPlanMarkup } from "../src/plan-ui.js";

test("empty planner directs the user to create or add a target", () => {
  const html = renderPlanMarkup({ plan: null, preview: null, tour: { active: false, currentIndex: -1 } });
  assert.match(html, /Create plan/);
  assert.match(html, /select a target/i);
});

test("agent preview shows proposed context and constellation-thread targets", () => {
  const html = renderPlanMarkup({
    preview: {
      id: "preview-1",
      source: "agent",
      title: "Child's first sky tour",
      audience: "child",
      durationMinutes: 30,
      minAltitude: 25,
      context: {
        date: "2026-08-29T01:00:00.000Z",
        latitude: 40.7128,
        longitude: -74.006,
        locationName: "New York City",
      },
      targets: [{
        targetId: "star-vega",
        name: "Vega",
        category: "bright_star",
        scheduledTime: "2026-08-29T01:00:00.000Z",
        minimumAltitude: 40,
        status: "upcoming",
      }],
    },
    plan: null,
    tour: { active: false, currentIndex: -1 },
  });
  assert.match(html, /Agent preview/);
  assert.match(html, /New York City/);
  assert.match(html, /Vega/);
  assert.match(html, /40° minimum/);
  assert.match(html, /Save this plan/);
});

test("tour markup exposes textual progress and previous-next controls", () => {
  const html = renderPlanMarkup({
    preview: null,
    plan: {
      title: "Tour",
      currentIndex: 0,
      targets: [
        { targetId: "star-vega", name: "Vega", category: "bright_star", status: "current", scheduledTime: "2026-08-29T01:00:00.000Z", minimumAltitude: 40 },
        { targetId: "m31", name: "Andromeda Galaxy", category: "deep_sky", status: "upcoming", scheduledTime: "2026-08-29T01:10:00.000Z", minimumAltitude: 35 },
      ],
    },
    tour: { active: true, currentIndex: 0 },
  });
  assert.match(html, /Target 1 of 2/);
  assert.match(html, /Previous target/);
  assert.match(html, /Next target/);
});
~~~

- [ ] **Step 2: Run markup tests and verify the module is missing**

Run: node --test tests/plan-ui.test.js

Expected: FAIL with ERR_MODULE_NOT_FOUND.

- [ ] **Step 3: Implement escaped, state-specific markup**

renderPlanMarkup() must use an internal escapeHtml() for all plan-authored text, format scheduledTime through Intl.DateTimeFormat with hour/minute and UTC label, map categories to Planet/Bright star/Deep sky, and render:

- empty state with data-action=create-plan;
- preview/edit state with labeled title, audience, duration, notes fields, save/dismiss buttons, validation/context summary, and reorder/remove controls;
- saved state with start-tour and edit controls;
- tour state with current textual progress and previous/next/index controls.

Target nodes must use an ordered list with class plan-thread, a text status, data-target-id, and buttons labeled with the target name.

- [ ] **Step 4: Run markup tests and verify they pass**

Run: node --test tests/plan-ui.test.js

Expected: 3 passing tests.

- [ ] **Step 5: Add the semantic planner shell and Add to plan control**

Add after styles.css:

~~~html
<link rel="stylesheet" href="plan.css" />
~~~

Add a header chip before Tonight:

~~~html
<button id="planToggle" class="chip-button plan-toggle" aria-expanded="false" aria-controls="planRail">
  <span class="plan-route-icon" aria-hidden="true">⋯</span>
  <span>Plan</span>
  <strong id="planCount" aria-label="0 targets">0</strong>
</button>
~~~

Add before the inspector:

~~~html
<aside id="planRail" class="plan-rail" aria-labelledby="planRailTitle" aria-hidden="true">
  <header class="plan-rail-header">
    <div><span class="panel-kicker">Observing route</span><h2 id="planRailTitle">Your sky plan</h2></div>
    <button id="closePlan" class="bare-button" aria-label="Close observing plan">×</button>
  </header>
  <div id="planContent" class="plan-content"></div>
  <p id="planStatus" class="sr-only" aria-live="polite"></p>
</aside>
~~~

Add next to Center:

~~~html
<button id="addObjectToPlan" class="focus-button" title="Add this object to the observing plan">
  <span aria-hidden="true">＋</span> Add to plan
</button>
~~~

- [ ] **Step 6: Implement the constellation-thread CSS exactly from the approved visual direction**

plan.css must define:

- --plan-amber: #e7bd72 and use it only for schedule metadata/current progress;
- fixed left rail top 78px, bottom 16px, width min(340px, calc(100vw - 32px)), transform-based closed/open states, existing panel background/border/shadow;
- a vertical thread using .plan-thread::before and circular node markers, with cyan upcoming, amber current, and muted complete states;
- compact forms using the existing DM Sans/Manrope variables and existing focus ring colors;
- 40px minimum target/action buttons on mobile;
- max-width 760px bottom drawer with max-height 82vh and transform translateY;
- prefers-reduced-motion rules removing rail/progress transitions.

Do not add gradients, ornaments, or animation outside the route thread and current-node pulse. The sky remains the dominant visual.

- [ ] **Step 7: Implement mountPlanUi event delegation and focus behavior**

~~~js
export function mountPlanUi({ root, toggle, status, actions, getSnapshot, onClose = () => {} }) {
  const render = () => {
    root.innerHTML = renderPlanMarkup(getSnapshot());
  };
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "create-plan") actions.createManualPlan({
      title: "My observing plan",
      audience: "general",
      durationMinutes: 30,
    });
    if (action === "save-plan") actions.savePlan({ previewId: getSnapshot().preview.id });
    if (action === "start-tour") actions.advanceTour({ direction: "start" });
    if (action === "next-target") actions.advanceTour({ direction: "next" });
    if (action === "previous-target") actions.advanceTour({ direction: "previous" });
    if (action === "go-target") actions.advanceTour({ targetIndex: Number(button.dataset.index) });
    if (action === "remove-target") actions.removeTargetFromPlan(button.dataset.targetId);
    if (action === "move-earlier" || action === "move-later") {
      actions.movePlanTarget({
        targetId: button.dataset.targetId,
        direction: action === "move-earlier" ? "earlier" : "later",
      });
    }
    render();
  });
  root.ownerDocument.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") onClose();
  });
  return { render, announce(message) { status.textContent = message; } };
}
~~~

Add delegated change/input handling for title, audience, duration, and notes that calls updatePlan() with exact field values. Opening the rail moves focus to its h2; closing returns focus to the toggle. Escape calls the supplied close callback only when the rail is open.

- [ ] **Step 8: Run all tests and commit the independently rendered UI**

Run: npm test

Expected: all tests pass; no application integration exists yet.

~~~bash
git add index.html plan.css src/plan-ui.js tests/plan-ui.test.js
git commit -m "feat: add observing plan rail"
~~~

---

### Task 6: Integrate shared actions with the existing atlas

**Files:**
- Modify: src/app.js:1-58, 658-688, 800-835, 877-1067
- Modify: index.html:194
- Create: tests/static.test.js
- Modify: package.json:7-10

**Interfaces:**
- Consumes: createAppActions(), loadPlan(), mountPlanUi(), and setupWebMcp().
- Produces: one live actions instance used by existing controls, planner controls, and WebMCP; package command npm run check.

- [ ] **Step 1: Write failing static integration tests**

~~~js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("top-level atlas loads planner styling and imperative WebMCP integration", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(html, /href="plan\.css"/);
  assert.match(html, /id="planRail"/);
  assert.match(html, /id="addObjectToPlan"/);
  assert.match(app, /createAppActions/);
  assert.match(app, /mountPlanUi/);
  assert.match(app, /setupWebMcp/);
  assert.doesNotMatch(html, /modelcontexttool|toolname=/i);
});

test("WebXR source remains free of planner and WebMCP coupling", async () => {
  const vr = await readFile(new URL("../src/vr.js", import.meta.url), "utf8");
  assert.doesNotMatch(vr, /modelContext|createAppActions|planRail/);
});
~~~

- [ ] **Step 2: Run static integration tests and verify app integration is missing**

Run: node --test tests/static.test.js

Expected: FAIL because src/app.js does not import or initialize the new modules.

- [ ] **Step 3: Extend live state and instantiate the action/UI adapters**

At the top of src/app.js import:

~~~js
import { createAppActions } from "./app-actions.js";
import { loadPlan } from "./plan-store.js";
import { mountPlanUi } from "./plan-ui.js";
import { setupWebMcp } from "./webmcp.js";
~~~

Add state keys plan, planPreview, planPanelOpen, and tour exactly as specified. After existing helper definitions, create an onStateChanged(change) adapter that:

- sets lastCatalogUpdate = 0 for time/location changes;
- synchronizes location inputs and label;
- synchronizes date/time playback controls;
- synchronizes layer checkboxes and survey select;
- calls scheduleSurvey() after location, time, framing, and survey changes;
- calls showInspector(state.selected) and opens the inspector after target-framed/tour-advanced;
- renders and opens the plan rail for planner/tour changes;
- announces change.message through plan UI.

Instantiate actions with window.localStorage, the live state, the effect adapter, and browser-safe ID creation using crypto.randomUUID() when available.

- [ ] **Step 4: Replace existing location/time/framing/layer control mutations with actions**

Keep focusObject() and setLocation() as narrow UI compatibility wrappers that delegate:

~~~js
function focusObject(object, fov = null) {
  if (!object) return;
  actions.frameTarget({
    targetId: object.id,
    ...(fov === null ? {} : { fieldOfView: fov }),
  });
}

function setLocation(latitude, longitude, name = "Custom location") {
  return actions.setObserverLocation({
    latitude: Number(latitude),
    longitude: Number(longitude),
    locationName: name,
  });
}
~~~

Update date input, time steps, Now, layer checkboxes, survey selector, search results, Tonight items, Center, preset locations, and geolocation callbacks to call actions. Keep direct panning, zooming, playback rate, canvas drawing, and hover state local because they are not shared tool operations.

- [ ] **Step 5: Mount the planner and connect manual object addition**

In init():

1. Restore the existing location.
2. Load the valid saved plan from localStorage into state.plan.
3. Create planUi through mountPlanUi().
4. Bind existing controls.
5. Render the plan UI and count.
6. Register WebMCP after the UI/action surface exists.

Bind planToggle/closePlan with aria-expanded and aria-hidden updates. Bind addObjectToPlan to actions.addTargetToPlan(state.selected.id), open the rail, and render. A UI error wrapper must catch AppError, announce its message, and leave unexpected errors uncaught after logging.

- [ ] **Step 6: Run the static test and full unit suite**

Run: npm test

Expected: all static, domain, persistence, action, WebMCP, UI, astronomy, and catalog tests pass.

- [ ] **Step 7: Add the syntax/static check command and run it**

Modify package.json scripts:

~~~json
{
  "dev": "python3 -m http.server 4173",
  "test": "node --test tests/*.test.js",
  "check": "node --check src/app-error.js && node --check src/astronomy.js && node --check src/catalog.js && node --check src/observing.js && node --check src/plan-store.js && node --check src/app-actions.js && node --check src/plan-ui.js && node --check src/webmcp.js && node --check src/app.js && node --check src/vr.js && npm test"
}
~~~

Run: npm run check

Expected: syntax checks exit 0 and the full suite passes.

- [ ] **Step 8: Start the static server and exercise normal UI without WebMCP**

Run: npm run dev

Expected: server listens on http://localhost:4173.

Use the in-app browser to verify:

- the page reports no console errors;
- search, select, center, time, location, layers, and deep-survey controls still work;
- create plan, add selected target, edit, reorder, remove, save, reload, start, previous, and next work;
- plan count, live message, existing inspector, and visible sky update together;
- localStorage restoration works while a mock page with no document.modelContext remains fully functional.

- [ ] **Step 9: Fix every browser-discovered defect with a failing automated regression test first**

For each defect, add the smallest test to the responsible test file, run it to see the expected failure, patch production code, and rerun npm run check. Do not make untested behavioral fixes.

- [ ] **Step 10: Commit the integrated application**

~~~bash
git add src/app.js index.html package.json tests/static.test.js
git commit -m "feat: connect planner UI and WebMCP actions"
~~~

---

### Task 7: Responsive, accessible, and real WebMCP browser verification

**Files:**
- Modify: plan.css for verified viewport or motion defects
- Modify: src/plan-ui.js for verified markup, focus, or interaction defects
- Modify: src/app.js for verified shared-state integration defects
- Modify: src/webmcp.js for verified discovery, schema, or handler defects
- Test: tests/plan-ui.test.js, tests/app-actions.test.js, tests/webmcp.test.js, or tests/static.test.js according to the responsible production module

**Interfaces:**
- Consumes: the running static site and in-app browser WebMCP capability.
- Produces: verified desktop/mobile UX, tool discovery evidence, successful representative calls, and regression tests for every fix.

- [ ] **Step 1: Verify desktop layout at the normal browser viewport**

Inspect a screenshot and DOM snapshot with the empty rail, manual edit rail, agent preview, saved state, and active tour. Confirm the rail does not cover the central time console, layer menu, location panel, or right inspector; target names and altitude metadata remain readable.

- [ ] **Step 2: Verify mobile layout at 390 × 844**

Use the browser viewport capability to set 390 × 844. Confirm 40px controls, bottom drawer max-height, scrollable content, reachable close button, no horizontal overflow, readable form labels, and the sky/time controls remain usable when the rail is closed. Reset the viewport after testing.

- [ ] **Step 3: Verify keyboard and reduced-motion behavior**

Tab through Plan, close, form, target, reorder, remove, save, and tour controls. Confirm focus enters and returns correctly, Escape closes the rail, textual progress is present, and a reduced-motion emulation or CSS inspection confirms transitions are removed.

- [ ] **Step 4: Fetch the page-defined WebMCP inventory in the in-app browser**

Expected tools: exactly the ten names in Task 4, with 3 read and 7 write tools. Confirm no tool originates from vr.html or an iframe.

- [ ] **Step 5: Call all three read-only tools and verify no visible state changes**

Call get_sky_context, find_observable_targets, and get_target_details. Capture observer time/location, selected target, layers, plan, and screenshot before and after. Results must be concise and state must remain equal.

- [ ] **Step 6: Run the exact preview-first demonstration with GPT-5.6 Sol or Terra**

Use this exact prompt:

> Build a 30-minute stargazing session for a child in New York tonight. Include one planet, one bright star, and one deep-sky object, keep every target above 25°, and avoid changing my location without showing me the plan first.

Expected call order:

1. get_sky_context
2. find_observable_targets
3. preview_observing_plan with proposed New York context and exact 1/1/1 requirements
4. visible preview inspection showing location/time unchanged
5. set_observer_location only after preview
6. set_observer_time when needed
7. save_observing_plan
8. advance_observing_tour with start, then next

Confirm preview and saved target altitudes satisfy 25° at slot start/mid/end and every mutation is visible.

- [ ] **Step 7: Call remaining state-changing tools and invalid inputs**

Exercise frame_target, configure_sky_layers, stale preview ID, unknown target, invalid ISO time, empty layer input, location mismatch, previous-at-start, and next-at-end. Expected error codes must match the spec and failed calls must not partially mutate state.

- [ ] **Step 8: Add failing regression tests for defects, fix, rerun checks, and commit**

Run: npm run check

Expected: all checks pass after every browser defect is represented by an automated test.

~~~bash
git add plan.css src/plan-ui.js src/app.js src/webmcp.js tests
git commit -m "fix: harden planner browser experience"
~~~

If browser testing finds no defects, do not create an empty commit.

---

### Task 8: README and hackathon submission package

**Files:**
- Modify: README.md
- Create: docs/submission/devpost.md
- Create: docs/submission/demo.md
- Create: docs/submission/checklist.md
- Create: docs/submission/attribution.md
- Test: tests/static.test.js

**Interfaces:**
- Consumes: final tool schemas, passing test counts, screenshots, browser results, baseline commit, and official rules.
- Produces: complete local submission copy and user-owned publishing checklist.

- [ ] **Step 1: Write failing documentation-presence tests**

~~~js
test("submission documentation names the baseline, tools, demo, and license audit", async () => {
  const files = await Promise.all([
    "../README.md",
    "../docs/submission/devpost.md",
    "../docs/submission/demo.md",
    "../docs/submission/checklist.md",
    "../docs/submission/attribution.md",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const combined = files.join("\n");
  assert.match(combined, /81672ede79762cbf3aadfe23a8dc9eee32013f94/);
  assert.match(combined, /get_sky_context/);
  assert.match(combined, /preview_observing_plan/);
  assert.match(combined, /WebMCP Leverage/);
  assert.match(combined, /under three minutes|less than three minutes/i);
  assert.match(combined, /MIT License/);
  assert.match(combined, /September 3, 2026.*1:00 PM PDT/i);
});
~~~

- [ ] **Step 2: Run the documentation test and verify missing files**

Run: node --test tests/static.test.js

Expected: FAIL with ENOENT for docs/submission/devpost.md.

- [ ] **Step 3: Rewrite README with verified product and test information**

Add:

- a top-of-file WebMCP observing planner summary and live URL;
- Before vs. after section naming July 22 baseline commit and August 28 extension;
- manual planner usage and local persistence behavior;
- WebMCP availability requirements, ten-tool table, read/write classification, and preview-first safety;
- updated architecture file map;
- npm test and npm run check commands with the actual final passing count;
- explicit statement that there is no separate linter or build step;
- manual in-app-browser test steps using Sol or Terra;
- retained WebXR, sources, limitations, contributing, and license material.

Change the Node requirement to the lowest version actually verified by npm run check; do not retain Node 20+ if verification only proves Node 18.19.1.

- [ ] **Step 4: Write docs/submission/devpost.md**

Include final-ready sections:

- Title: Night Sky Atlas — Plan the Sky Together
- Tagline: A shared, visible observing route for people and their AI agents.
- Description explaining the real audience/problem, WebMCP fit, shared-state experience, and static architecture.
- Technologies.
- Challenges.
- Accomplishments.
- Lessons learned.
- Future work.
- A four-row judging map titled WebMCP Leverage, Execution, Potential Impact, and Creativity & Ambition with concrete evidence.

- [ ] **Step 5: Write the sub-three-minute demo package**

docs/submission/demo.md must contain a timed 0:00–2:50 storyboard, word-for-word narration, exact preview-first prompt, tool call sequence, shot list, captions, fallback cut plan, and screenshot plan. Shots must show baseline planetarium, manual editing, agent preview before location mutation, saved route, tour advancement, mobile layout, and the Available site tools menu.

- [ ] **Step 6: Write the final checklist and attribution/license audit**

docs/submission/checklist.md must separate completed local checks from user-owned actions: Devpost enrollment/attestations/submission, GitHub authentication/push/Pages publication, logged-in ChatGPT final test, YouTube upload, and final publication approval. Include the September 3 1:00 PM PDT deadline, repository/live-site freeze during judging, public repo/license visibility, live URL, public YouTube under three minutes, and no copyrighted music.

docs/submission/attribution.md must audit MIT project code, Google Fonts DM Sans/Manrope, Three.js 0.180 via jsDelivr, Yale Bright Star Catalog/SIMBAD/OpenNGC-derived curated facts, CDS HiPS2FITS with DSS2/Pan-STARRS/2MASS, and every catalog image's embedded credit/source metadata. State that remote image licenses are not relicensed by the project MIT license.

- [ ] **Step 7: Run documentation and full checks**

Run: npm run check

Expected: documentation presence test and all other tests pass; README's test count matches the output.

- [ ] **Step 8: Commit submission materials**

~~~bash
git add README.md docs/submission tests/static.test.js
git commit -m "docs: prepare WebMCP challenge submission"
~~~

---

### Task 9: Final local verification and review handoff

**Files:**
- Modify only for regression fixes: files responsible for a reproduced defect
- Test: the corresponding tests/*.test.js file

**Interfaces:**
- Consumes: all implementation and documentation.
- Produces: a clean, reviewable local branch with evidence and no external publication.

- [ ] **Step 1: Run the complete automated verification from a clean server state**

Run: npm run check

Expected: syntax checks and every test pass with zero failures, skips, warnings, or unhandled rejections.

- [ ] **Step 2: Run whitespace, status, and commit-range checks**

Run: git diff --check

Expected: no output.

Run: git status --short --branch

Expected: branch webmcp-challenge with a clean worktree.

Run: git log --oneline 81672ede79762cbf3aadfe23a8dc9eee32013f94..HEAD

Expected: design, domain, persistence, actions, WebMCP, UI, integration, browser-hardening when needed, and submission-document commits.

- [ ] **Step 3: Repeat desktop and mobile smoke tests without WebMCP**

Verify search, canvas drag/zoom, Tonight, location, time playback, layers, inspector, survey fallback, manual plan creation/edit/save/reload, and tour progress. Confirm zero browser console errors.

- [ ] **Step 4: Repeat the real WebMCP preview-first scenario**

Use GPT-5.6 Sol or Terra. Confirm exact ten-tool discovery, 3 read/7 write classification, one planet/one bright star/one deep-sky object, every sampled altitude at least 25°, preview before location mutation, successful save, and visible tour advancement.

- [ ] **Step 5: Perform a focused code review against the approved spec**

Review every spec requirement, mutation boundary, schema, annotation, error code, visible effect, mobile/accessibility rule, non-goal, and submission artifact. Record any gap as a failing test before fixing it.

- [ ] **Step 6: Run final checks after review fixes**

Run: npm run check

Expected: all checks pass.

Run: git status --short --branch

Expected: clean webmcp-challenge branch.

- [ ] **Step 7: Prepare the user handoff without publishing**

Report:

- branch and commit range;
- baseline and before/after evidence;
- final test/check results;
- desktop/mobile/WebMCP verification results;
- exact local files containing Devpost and demo materials;
- a short logged-in ChatGPT manual checklist;
- the explicit checkpoint that push, Pages deployment, YouTube upload, and Devpost submission remain undone pending approval.
