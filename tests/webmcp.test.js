import test from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../src/app-error.js";
import { createWebMcpTools, registerWebMcpTools, setupWebMcp } from "../src/webmcp.js";

const methodNames = [
  "getSkyContext", "findObservableTargets", "getTargetDetails",
  "setObserverLocation", "setObserverTime", "frameTarget", "previewPlan",
  "savePlan", "advanceTour", "configureLayers",
];
const actions = Object.fromEntries(methodNames.map((name) => [name, (input = {}) => ({ name, input })]));

test("WebMCP exposes the ten supported tools with strict schemas and accurate annotations", () => {
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
    assert.equal(tool.annotations.untrustedContentHint, false);
  }
  assert.deepEqual(
    tools.filter((tool) => tool.annotations.readOnlyHint).map((tool) => tool.name),
    ["get_sky_context", "find_observable_targets", "get_target_details"],
  );
  const findTargets = tools.find((tool) => tool.name === "find_observable_targets");
  assert.equal(findTargets.inputSchema.properties.categories.uniqueItems, true);
  const preview = tools.find((tool) => tool.name === "preview_observing_plan");
  assert.deepEqual(preview.inputSchema.required, [
    "title", "audience", "duration_minutes", "target_ids", "category_requirements", "min_altitude",
  ]);
  assert.equal(preview.inputSchema.properties.target_ids.uniqueItems, true);
  assert.equal(preview.inputSchema.properties.observer.properties.location_name.maxLength, 80);
  assert.equal(preview.inputSchema.properties.notes.maxLength, 500);
  const tour = tools.find((tool) => tool.name === "advance_observing_tour");
  assert.equal(tour.inputSchema.oneOf.length, 2);
});

test("tool handlers translate every snake_case input and serialize expected errors", async () => {
  const calls = [];
  const translatedActions = Object.fromEntries(methodNames.map((name) => [name, (...args) => {
    calls.push({ name, args });
    return { name };
  }]));
  const tools = createWebMcpTools(translatedActions);
  const execute = (name, input) => tools.find((tool) => tool.name === name).execute(input);

  assert.deepEqual(await execute("get_sky_context", {}), { ok: true, name: "getSkyContext" });
  await execute("find_observable_targets", {
    categories: ["planet"], min_altitude: 25, max_magnitude: 4, at_time: "2026-08-29T01:00:00.000Z", limit: 3,
  });
  await execute("get_target_details", { target_id: "star-vega", at_time: "2026-08-29T02:00:00.000Z" });
  await execute("set_observer_location", { latitude: 40.7128, longitude: -74.006, location_name: "New York City" });
  await execute("set_observer_time", { iso_time: "2026-08-29T01:00:00.000Z" });
  await execute("frame_target", { target_id: "star-vega", field_of_view: 12 });
  await execute("preview_observing_plan", {
    title: "Child's sky", audience: "child", notes: "Start bright.", duration_minutes: 30,
    target_ids: ["planet-jupiter", "star-vega", "deep-sky-m13"],
    category_requirements: { planet: 1, bright_star: 1, deep_sky: 1 }, min_altitude: 25,
    start_time: "2026-08-29T01:00:00.000Z",
    observer: { latitude: 40.7128, longitude: -74.006, location_name: "New York City" },
  });
  await execute("save_observing_plan", { preview_id: "preview-1" });
  await execute("advance_observing_tour", { target_index: 2 });
  await execute("configure_sky_layers", { stars: false, survey: "off" });

  assert.deepEqual(calls, [
    { name: "getSkyContext", args: [] },
    { name: "findObservableTargets", args: [{
      categories: ["planet"], minAltitude: 25, maxMagnitude: 4, atTime: "2026-08-29T01:00:00.000Z", limit: 3,
    }] },
    { name: "getTargetDetails", args: ["star-vega", "2026-08-29T02:00:00.000Z"] },
    { name: "setObserverLocation", args: [{ latitude: 40.7128, longitude: -74.006, locationName: "New York City" }] },
    { name: "setObserverTime", args: [{ isoTime: "2026-08-29T01:00:00.000Z" }] },
    { name: "frameTarget", args: [{ targetId: "star-vega", fieldOfView: 12 }] },
    { name: "previewPlan", args: [{
      title: "Child's sky", audience: "child", notes: "Start bright.", durationMinutes: 30,
      targetIds: ["planet-jupiter", "star-vega", "deep-sky-m13"],
      categoryRequirements: { planet: 1, bright_star: 1, deep_sky: 1 }, minAltitude: 25,
      startTime: "2026-08-29T01:00:00.000Z",
      observer: { latitude: 40.7128, longitude: -74.006, locationName: "New York City" },
      source: "agent",
    }] },
    { name: "savePlan", args: [{ previewId: "preview-1" }] },
    { name: "advanceTour", args: [{ targetIndex: 2 }] },
    { name: "configureLayers", args: [{ stars: false, survey: "off" }] },
  ]);
});

test("advance observing tour forwards a direction alternative to the action", async () => {
  let received;
  const tools = createWebMcpTools({
    ...actions,
    advanceTour(input) {
      received = input;
      return { moved: true };
    },
  });

  const result = await tools.find((tool) => tool.name === "advance_observing_tour").execute({ direction: "next" });

  assert.deepEqual(result, { ok: true, moved: true });
  assert.deepEqual(received, { direction: "next" });
});

test("tool handlers serialize expected AppError failures", async () => {
  const tools = createWebMcpTools({
    ...actions,
    getTargetDetails() {
      throw new AppError("TARGET_NOT_FOUND", "Target not found.", { targetId: "missing" });
    },
  });

  assert.deepEqual(await tools.find((tool) => tool.name === "get_target_details").execute({ target_id: "missing" }), {
    ok: false,
    error: { code: "TARGET_NOT_FOUND", message: "Target not found.", details: { targetId: "missing" } },
  });
});

test("tool handlers rethrow unexpected errors for diagnostics", async () => {
  const tools = createWebMcpTools({
    ...actions,
    getSkyContext() { throw new TypeError("programmer mistake"); },
  });
  await assert.rejects(
    tools.find((tool) => tool.name === "get_sky_context").execute({}),
    /programmer mistake/,
  );
});

test("registration is sequential and WebMCP absence is graceful", async () => {
  const registered = [];
  let activeRegistration = false;
  const modelContext = {
    async registerTool(tool) {
      assert.equal(activeRegistration, false, "tools must not register concurrently");
      activeRegistration = true;
      await Promise.resolve();
      registered.push(tool.name);
      activeRegistration = false;
    },
  };

  const summary = await registerWebMcpTools(modelContext, createWebMcpTools(actions));

  assert.deepEqual(summary, {
    supported: true,
    registered: [
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
    ],
  });
  assert.deepEqual(registered, summary.registered);
  assert.deepEqual(await setupWebMcp(actions, {}), { supported: false, registered: [] });
});
