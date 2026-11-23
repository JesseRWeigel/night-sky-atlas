import test from "node:test";
import assert from "node:assert/strict";
import { formatPortableTime, previewPortableAtLocation } from "../src/portable-plan-ui.js";

const utc = "2026-08-29T01:00:00.000Z";
const location = { latitude: 40.7128, longitude: -74.006, locationName: "Fixture observer" };
const recipe = {
  format: "night-sky-atlas/plan-recipe", version: 1, startTimeUtc: utc, audience: "general",
  durationMinutes: 25, targetIds: ["star-vega", "star-deneb"],
  categoryRequirements: { planet: 0, bright_star: 2, deep_sky: 0 },
};
test("labels the unchanged instant and the browser zone, not an original calendar zone", () => {
  assert.match(formatPortableTime(utc, "America/Los_Angeles"), /2026-08-29T01:00:00.000Z.*America\/Los_Angeles.*Aug 28, 2026.*6:00 PM/);
});
test("distinguishes repeated browser wall times when daylight saving ends", () => {
  const zone = "America/New_York";
  const first = formatPortableTime("2026-11-01T05:30:00.000Z", zone);
  const second = formatPortableTime("2026-11-01T06:30:00.000Z", zone);
  assert.match(first, /05:30:00\.000Z.*Nov 1, 2026.*1:30 AM GMT-4$/);
  assert.match(second, /06:30:00\.000Z.*Nov 1, 2026.*1:30 AM GMT-5$/);
});
test("labels the actual fractional offset when local time rolls into another day", () => {
  const nextDayUtc = "2026-08-29T20:30:00.000Z";
  assert.match(formatPortableTime(nextDayUtc, "Asia/Kathmandu"),
    /2026-08-29T20:30:00\.000Z.*Asia\/Kathmandu.*Aug 30, 2026.*2:15 AM GMT\+5:45$/);
});
test("import previews the shared UTC and IDs against only the local observer", () => {
  const preview = previewPortableAtLocation(JSON.stringify(recipe), location);
  assert.equal(preview.context.date, utc);
  assert.equal(preview.context.locationName, location.locationName);
  assert.deepEqual(preview.targets.map((target) => target.targetId), recipe.targetIds);
  assert.deepEqual(preview.targets.map((target) => target.scheduledTime), [utc, "2026-08-29T01:13:00.000Z"]);
  assert.throws(() => previewPortableAtLocation(JSON.stringify({ ...recipe, version: 9 }), location),
    { code: "UNSUPPORTED_PORTABLE_PLAN_VERSION" });
  assert.throws(() => previewPortableAtLocation(JSON.stringify({ ...recipe, targetIds: ["not-in-catalog", "star-deneb"] }), location),
    { code: "TARGET_NOT_FOUND" });
});

test("manual controls preview export and import without writing the saved plan", async () => {
  const { mountPortablePlanUi } = await import("../src/portable-plan-ui.js");
  class FakeNode extends EventTarget {
    textContent = "";
    value = "";
    hidden = false;
    focused = false;
    children = [];
    focus() { this.focused = true; }
    replaceChildren() { this.children = []; }
    append(child) { this.children.push(child); }
  }
  const nodes = new Map([
    "portableResult", "portableTargets", "portableInput", "portableOutputGroup", "portableOutput",
    "portableExportTime", "portableExport", "portableImport",
  ].map((id) => [id, new FakeNode()]));
  const node = (id) => nodes.get(id);
  const root = Object.assign(new FakeNode(), {
    open: true,
    querySelector: (selector) => node(selector.slice(1)),
    ownerDocument: { createElement: () => new FakeNode() },
  });
  let plan = null;
  const ui = mountPortablePlanUi({ root, getPlan: () => plan, getLocation: () => location });
  const click = (id) => node(id).dispatchEvent(new Event("click"));
  click("portableExport");
  assert.match(node("portableResult").textContent, /Save a plan/);
  plan = { ...previewPortableAtLocation(JSON.stringify(recipe), location), title: "Private Title", notes: "Private Notes" };
  const original = structuredClone(plan);
  click("portableExport");
  const json = node("portableOutput").value;
  assert.equal(node("portableOutput").focused, true);
  assert.equal(node("portableOutputGroup").hidden, false);
  assert.doesNotMatch(json, /Private|Fixture observer|40\.7128|-74\.006/);
  assert.match(node("portableExportTime").textContent, /UTC:.*Browser time/);
  node("portableInput").value = json;
  click("portableImport");
  assert.match(node("portableResult").textContent, /Preview for Fixture observer.*No plan was saved or replaced/);
  assert.equal(node("portableTargets").children.length, 2);
  for (const invalid of ["bogus", JSON.stringify({ ...recipe, version: 9 })]) {
    node("portableInput").value = invalid;
    click("portableImport");
    assert.match(node("portableResult").textContent, /Cannot preview/);
    assert.equal(node("portableTargets").children.length, 0);
    assert.deepEqual(plan, original);
  }
  ui.close();
  assert.equal(root.open, false);
  assert.equal(node("portableInput").value, "");
  assert.equal(node("portableOutput").value, "");
  assert.equal(node("portableOutputGroup").hidden, true);
});
