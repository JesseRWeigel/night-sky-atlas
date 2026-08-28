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

test("plan clearing reports unavailable persistence", () => {
  const storage = { removeItem() { throw new Error("denied"); } };
  assert.throws(
    () => clearPlan(storage),
    (error) => error.code === "PERSISTENCE_UNAVAILABLE",
  );
});

test("plan saving rejects structurally incomplete plans", () => {
  const storage = memoryStorage();
  const invalidPlan = { ...validPlan, targets: [] };
  assert.throws(() => savePlan(storage, invalidPlan), (error) => {
    assert.equal(error.code, "INVALID_PLAN");
    return true;
  });
  assert.equal(storage.getItem(PLAN_STORAGE_KEY), null);
});

test("plan loading ignores structurally incomplete plans", () => {
  const storage = memoryStorage();
  storage.setItem(PLAN_STORAGE_KEY, JSON.stringify({ ...validPlan, currentIndex: 1 }));
  assert.equal(loadPlan(storage), null);
});
