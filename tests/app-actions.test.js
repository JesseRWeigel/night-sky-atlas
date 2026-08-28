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

test("tour boundary rejects the next direction without changing progress", () => {
  const { actions, state } = harness();
  actions.createManualPlan({ title: "One target", audience: "general", durationMinutes: 10 });
  actions.addTargetToPlan("star-vega");
  actions.savePlan({ previewId: state.planPreview.id });
  actions.advanceTour({ direction: "start" });
  const snapshot = structuredClone(state);
  assert.throws(
    () => actions.advanceTour({ direction: "next" }),
    (error) => error.code === "TOUR_BOUNDARY",
  );
  assert.deepEqual(state, snapshot);
});

test("manual draft validation leaves state unchanged", () => {
  const { actions, state } = harness();
  const snapshot = structuredClone(state);
  assert.throws(
    () => actions.createManualPlan({
      title: "Invalid",
      audience: "general",
      durationMinutes: 10,
      categoryRequirements: { bright_star: 1 },
    }),
    (error) => error.code === "INVALID_INPUT",
  );
  assert.deepEqual(state, snapshot);
});

test("empty manual draft updates validate before replacing the preview", () => {
  const { actions, state } = harness();
  actions.createManualPlan({ title: "Manual", audience: "general", durationMinutes: 10 });
  const snapshot = structuredClone(state);
  assert.throws(
    () => actions.updatePlan({ minAltitude: 91 }),
    (error) => error.code === "INVALID_INPUT",
  );
  assert.deepEqual(state, snapshot);
});

test("plan previews reject whitespace-only titles without mutating state", () => {
  const { actions, state, changes } = harness();
  const snapshot = structuredClone(state);
  assert.throws(
    () => actions.previewPlan({
      title: " ",
      audience: "general",
      durationMinutes: 10,
      targetIds: ["star-vega"],
      categoryRequirements: { planet: 0, bright_star: 1, deep_sky: 0 },
      minAltitude: 0,
    }),
    (error) => error.code === "INVALID_INPUT",
  );
  assert.deepEqual(state, snapshot);
  assert.deepEqual(changes, []);
});

test("save keeps the preview when persistence rejects its structural shape", () => {
  const { actions, state, changes } = harness();
  const preview = actions.previewPlan({
    title: "Valid title",
    audience: "general",
    durationMinutes: 10,
    targetIds: ["star-vega"],
    categoryRequirements: { planet: 0, bright_star: 1, deep_sky: 0 },
    minAltitude: 0,
  });
  state.planPreview.title = " ";
  const snapshot = structuredClone(state);
  const changeCount = changes.length;
  assert.throws(
    () => actions.savePlan({ previewId: preview.preview.id }),
    (error) => error.code === "INVALID_PLAN",
  );
  assert.deepEqual(state, snapshot);
  assert.equal(changes.length, changeCount);
});

test("preview rejects a null observer with typed atomic validation", () => {
  const { actions, state, changes } = harness();
  const snapshot = structuredClone(state);
  assert.throws(
    () => actions.previewPlan({
      title: "Null observer",
      audience: "general",
      durationMinutes: 10,
      targetIds: ["star-vega"],
      categoryRequirements: { planet: 0, bright_star: 1, deep_sky: 0 },
      minAltitude: 0,
      observer: null,
    }),
    (error) => error.code === "INVALID_INPUT",
  );
  assert.deepEqual(state, snapshot);
  assert.deepEqual(changes, []);
});
