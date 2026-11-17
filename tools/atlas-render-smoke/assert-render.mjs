import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertRender(before, after) {
  for (const result of [before, after]) {
    assert.equal(result.instant, '2026-11-16T11:00:00.000Z');
    assert.equal(result.mode, 'LOCAL SKY');
    assert.ok(result.width >= 800 && result.height >= 500, 'Desktop viewport needed');
    assert.ok(result.dpr > 0 && Number.isFinite(result.dpr));
    assert.equal(result.canvasWidth, Math.round(result.width * result.dpr));
    assert.equal(result.canvasHeight, Math.round(result.height * result.dpr));
  }
  for (const field of ['width', 'height', 'dpr', 'canvasWidth', 'canvasHeight']) {
    assert.equal(before[field], after[field], field);
  }
  assert.equal(before.daylight, true);
  assert.equal(after.daylight, false);
  assert.ok(!before.targets.Mars?.onCanvas, 'Baseline Mars should be out of frame');
  assert.equal(after.targets.Sun, null);
  const { Mars, Jupiter } = after.targets;
  assert.ok(Mars?.onCanvas && Jupiter?.onCanvas, 'Both planets must reach the canvas');
  const separation = Math.hypot(Mars.x - Jupiter.x, Mars.y - Jupiter.y);
  const normalized = separation / after.width;
  assert.ok(normalized > .015 && normalized < .055, 'Bright planets should be distinctly close');
  assert.ok(Mars.x < Jupiter.x && Mars.y < Jupiter.y, 'Mars must be upper left of Jupiter');
  assert.ok(Math.hypot(Mars.x - after.width / 2, Mars.y - after.height / 2) < 2, 'JPL Mars fixture should be at the center');
  return { separationCssPx: separation, widthCssPx: after.width };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputs = process.argv.slice(2);
  assert.equal(inputs.length, 2, 'Usage: node assert-render.mjs baseline.json patched.json');
  console.log(JSON.stringify(assertRender(...inputs.map(p => JSON.parse(readFileSync(p, 'utf8')))), null, 2));
}
