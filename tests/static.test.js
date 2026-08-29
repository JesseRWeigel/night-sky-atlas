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

test("an open desktop plan rail reserves space for the time console", async () => {
  const css = await readFile(new URL("../plan.css", import.meta.url), "utf8");
  assert.match(
    css,
    /@media \(min-width: 761px\) and \(max-width: 1364px\)[\s\S]*?\.workspace:has\(\.plan-rail\.open\) \.time-console\s*\{[\s\S]*?left:\s*calc\(\(100vw \+ 372px\) \/ 2\)/,
  );
});

test("location control sync updates the observing-site preset", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(
    app,
    /function syncLocationControls\(\)[\s\S]*?sitePreset[\s\S]*?option\.value\.split\(","\)[\s\S]*?state\.latitude[\s\S]*?state\.longitude[\s\S]*?sitePreset\.value\s*=\s*matchingPreset\?\.value\s*\|\|\s*"custom"/,
  );
});

test("Add to plan relies on the shared change effect so duplicate focus survives", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(
    app,
    /actions\.addTargetToPlan\(state\.selected\.id\);\s*(?:setPlanPanelOpen|planUi\.render)/,
  );
});

test("mobile planner form controls meet the 40px touch-target floor", async () => {
  const css = await readFile(new URL("../plan.css", import.meta.url), "utf8");
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.plan-form input,\s*\.plan-form select\s*\{[\s\S]*?min-height:\s*40px/,
  );
});

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
