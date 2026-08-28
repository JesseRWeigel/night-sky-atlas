import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

class ReplacingPlanRoot extends FakeEventTarget {
  constructor(ownerDocument) {
    super(ownerDocument);
    this.fields = new Map();
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (!this.fields) return;
    this.ownerDocument.activeElement = null;
    this.fields = new Map();
    const title = value.match(/data-field="title"[^>]*value="([^"]*)"/)?.[1];
    if (title === undefined) return;
    const field = fieldTarget("title", title);
    field.ownerDocument = this.ownerDocument;
    field.parentNode = this;
    field.selectionStart = 0;
    field.selectionEnd = 0;
    field.selectionDirection = "none";
    field.focus = () => { this.ownerDocument.activeElement = field; };
    field.setSelectionRange = (start, end, direction = "none") => {
      field.selectionStart = start;
      field.selectionEnd = end;
      field.selectionDirection = direction;
    };
    this.fields.set("title", field);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  contains(node) {
    return node?.parentNode === this;
  }

  querySelector(selector) {
    const field = selector.match(/^\[data-field="([^"]+)"\]$/)?.[1];
    return field ? this.fields.get(field) ?? null : null;
  }
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

test("planner rerenders preserve focus and selection across multi-character input", () => {
  const document = new FakeEventTarget();
  document.activeElement = null;
  const root = new ReplacingPlanRoot(document);
  const toggle = new FakeEventTarget(document);
  const status = new FakeEventTarget(document);
  const snapshot = {
    preview: { id: "preview-1", title: "", audience: "general", durationMinutes: 30, notes: "", targets: [] },
    plan: null,
    tour: { active: false, currentIndex: -1 },
  };
  let ui;
  const actions = {
    updatePlan(value) {
      snapshot.preview = { ...snapshot.preview, ...value };
      ui.render();
    },
  };
  ui = mountPlanUi({ root, toggle, status, actions, getSnapshot: () => snapshot });
  ui.render();

  for (const value of ["M", "Ma", "Mars"]) {
    const field = root.querySelector('[data-field="title"]');
    field.focus();
    field.value = value;
    field.selectionStart = value.length;
    field.selectionEnd = value.length;
    root.dispatch("input", { target: field });

    const replacement = root.querySelector('[data-field="title"]');
    assert.equal(document.activeElement, replacement);
    assert.equal(replacement.value, value);
    assert.equal(replacement.selectionStart, value.length);
    assert.equal(replacement.selectionEnd, value.length);
  }
});

test("edit action delegates through updatePlan and renders the resulting preview", () => {
  const document = new FakeEventTarget();
  const root = new FakeEventTarget(document);
  const toggle = new FakeEventTarget(document);
  const status = new FakeEventTarget(document);
  const calls = [];
  const saved = {
    id: "plan-1",
    title: "Saved route",
    audience: "general",
    durationMinutes: 30,
    notes: "Keep this note",
    context: { locationName: "New York City", latitude: 40.7128, longitude: -74.006 },
    targets: [],
  };
  const snapshot = {
    preview: null,
    plan: saved,
    tour: { active: false, currentIndex: -1 },
  };
  const actions = {
    updatePlan(value) {
      calls.push(value);
      snapshot.preview = { ...structuredClone(saved), status: "preview", source: "manual" };
    },
  };
  const ui = mountPlanUi({ root, toggle, status, actions, getSnapshot: () => snapshot });
  ui.render();
  assert.match(root.innerHTML, /Saved route/);
  assert.match(root.innerHTML, /Start tour/);

  root.dispatch("click", { target: actionTarget({ action: "edit-plan" }) });

  assert.deepEqual(calls, [{}]);
  assert.match(root.innerHTML, /data-field="title"/);
  assert.match(root.innerHTML, /value="Saved route"/);
  assert.match(root.innerHTML, /Keep this note/);
});

test("mobile plan label remains available to assistive technology", () => {
  const css = readFileSync(new URL("../plan.css", import.meta.url), "utf8");
  const labelRule = css.match(/\.plan-toggle > span:nth-child\(2\)\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(labelRule, /display:\s*none/);
  assert.match(labelRule, /clip-path:\s*inset\(50%\)/);
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
