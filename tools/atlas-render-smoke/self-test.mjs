import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertRender } from './assert-render.mjs';
const control = JSON.parse(readFileSync(new URL('./staged-orientation.json', import.meta.url)));
const common = {
  instant: '2026-11-16T11:00:00.000Z', mode: 'LOCAL SKY',
  width: 1024, height: 768, dpr: 1, canvasWidth: 1024, canvasHeight: 768,
};
function synthetic(which, daylight) {
  const targets = Object.fromEntries(Object.entries(control[which]).map(([name, p]) =>
    [name, p.visible ? { x: p.x, y: p.y, onCanvas: true } : null]));
  return { ...common, daylight, targets };
}
const baseline = synthetic('before', true);
const patched = synthetic('after', false);
assert.ok(assertRender(baseline, patched).separationCssPx > 30);
const values = ['Jupiter', 'Mars'];
for (const target of values) {
  assert.throws(() => assertRender(baseline, {
    ...patched, targets: { ...patched.targets, [target]: null },
  }));
}
assert.throws(() => assertRender(baseline, { ...patched, width: 1000, canvasWidth: 1000 }));
assert.throws(() => assertRender(baseline, { ...patched, daylight: true }));
assert.throws(() => assertRender(baseline, {
  ...patched, targets: { ...patched.targets, Jupiter: patched.targets.Mars },
}));
console.log('Six synthetic validator checks passed; no browser or rendering.');
