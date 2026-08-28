import test from "node:test";
import assert from "node:assert/strict";
import { mountPlanUi, renderPlanMarkup } from "../src/plan-ui.js";

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

test("saved planner offers edit and tour actions while escaping authored text", () => {
  const html = renderPlanMarkup({
    preview: null,
    plan: {
      title: '<img src=x onerror="alert(1)">',
      context: { locationName: "A&B <site>", latitude: 1, longitude: 2 },
      targets: [{
        targetId: 'bad" onclick="alert(1)',
        name: "Vega <script>alert(1)</script>",
        category: "bright_star",
        status: "upcoming",
        scheduledTime: "2026-08-29T01:00:00.000Z",
        minimumAltitude: 40,
      }],
    },
    tour: { active: false, currentIndex: -1 },
  });
  assert.match(html, /Edit plan/);
  assert.match(html, /Start tour/);
  assert.match(html, /1:00 AM UTC/);
  assert.match(html, /Bright star/);
  assert.doesNotMatch(html, /<script>|<img/);
  assert.match(html, /A&amp;B &lt;site&gt;/);
  assert.match(html, /data-target-id="bad&quot; onclick=&quot;alert\(1\)"/);
});

class FakeEventTarget {
  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.listeners = new Map();
    this.attributes = new Map();
    this.innerHTML = "";
    this.textContent = "";
    this.focusCount = 0;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type, event = {}) {
    this.listeners.get(type)?.(event);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  focus() {
    this.focusCount += 1;
  }
}

function actionTarget(dataset) {
  const button = { dataset };
  return { closest: (selector) => selector === "[data-action]" ? button : null };
}

function fieldTarget(field, value) {
  const target = { dataset: { field }, value };
  target.closest = (selector) => selector === "[data-field]" ? target : null;
  return target;
}

test("mounted planner delegates actions and editable fields with exact values", () => {
  const calls = [];
  const document = new FakeEventTarget();
  const root = new FakeEventTarget(document);
  const toggle = new FakeEventTarget(document);
  const status = new FakeEventTarget(document);
  const snapshot = {
    preview: { id: "preview-1", title: "Draft", audience: "general", durationMinutes: 30, notes: "", targets: [] },
    plan: null,
    tour: { active: false, currentIndex: -1 },
  };
  const actions = {
    createManualPlan: (value) => calls.push(["create", value]),
    updatePlan: (value) => calls.push(["update", value]),
    savePlan: (value) => calls.push(["save", value]),
    removeTargetFromPlan: (value) => calls.push(["remove", value]),
    movePlanTarget: (value) => calls.push(["move", value]),
    advanceTour: (value) => calls.push(["tour", value]),
  };
  const ui = mountPlanUi({ root, toggle, status, actions, getSnapshot: () => snapshot });
  ui.render();
  root.dispatch("click", { target: actionTarget({ action: "create-plan" }) });
  root.dispatch("click", { target: actionTarget({ action: "save-plan" }) });
  root.dispatch("click", { target: actionTarget({ action: "move-earlier", targetId: "star-vega" }) });
  root.dispatch("click", { target: actionTarget({ action: "remove-target", targetId: "star-vega" }) });
  root.dispatch("click", { target: actionTarget({ action: "go-target", index: "2" }) });
  root.dispatch("input", { target: fieldTarget("title", "Moon & stars") });
  root.dispatch("change", { target: fieldTarget("audience", "child") });
  root.dispatch("change", { target: fieldTarget("durationMinutes", "45") });
  root.dispatch("input", { target: fieldTarget("notes", "Bring binoculars") });
  assert.deepEqual(calls, [
    ["create", { title: "My observing plan", audience: "general", durationMinutes: 30 }],
    ["save", { previewId: "preview-1" }],
    ["move", { targetId: "star-vega", direction: "earlier" }],
    ["remove", "star-vega"],
    ["tour", { targetIndex: 2 }],
    ["update", { title: "Moon & stars" }],
    ["update", { audience: "child" }],
    ["update", { durationMinutes: 45 }],
    ["update", { notes: "Bring binoculars" }],
  ]);
  ui.announce("Plan updated");
  assert.equal(status.textContent, "Plan updated");
});

test("mounted planner focuses its heading on open and returns focus on Escape close", async () => {
  let closeCount = 0;
  const document = new FakeEventTarget();
  const root = new FakeEventTarget(document);
  const toggle = new FakeEventTarget(document);
  const status = new FakeEventTarget(document);
  const heading = new FakeEventTarget(document);
  const rail = { querySelector: (selector) => selector === "h2" ? heading : null };
  document.getElementById = (id) => id === "planRail" ? rail : null;
  toggle.setAttribute("aria-controls", "planRail");
  toggle.setAttribute("aria-expanded", "true");
  mountPlanUi({
    root,
    toggle,
    status,
    actions: {},
    getSnapshot: () => ({ plan: null, preview: null, tour: { active: false, currentIndex: -1 } }),
    onClose: () => { closeCount += 1; },
  });
  toggle.dispatch("click");
  await Promise.resolve();
  assert.equal(heading.focusCount, 1);
  document.dispatch("keydown", { key: "Escape" });
  assert.equal(closeCount, 1);
  assert.equal(toggle.focusCount, 1);
  toggle.setAttribute("aria-expanded", "false");
  document.dispatch("keydown", { key: "Escape" });
  assert.equal(closeCount, 1);
});
