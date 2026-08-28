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
