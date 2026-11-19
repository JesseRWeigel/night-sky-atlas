import assert from "node:assert/strict";
import test from "node:test";
import { createAppActions } from "../src/app-actions.js";
import { mountPortablePlanUi, previewPortableAtLocation } from "../src/portable-plan-ui.js";

class Control extends EventTarget {
  value = "";
  textContent = "";
  children = [];
  hidden = false;
  open = true;
  replaceChildren() { this.children = []; }
  append(child) { this.children.push(child); }
}
const fixture = JSON.stringify({
  format: 'night-sky-atlas/plan-recipe', version: 1, startTimeUtc: '2026-08-29T01:00:00.000Z',
  audience: 'general', durationMinutes: 25, targetIds: ['star-vega','star-deneb'],
  categoryRequirements: {planet:0, bright_star:2, deep_sky:0}
});

test('observer switches clear a no-longer-valid generated preview while keeping manual input', () => {
  const fields = new Map();
  const root = new Control();
  root.querySelector = (key) => {
    if (!fields.has(key)) fields.set(key, new Control());
    return fields.get(key);
  };
  root.ownerDocument = {createElement: () => new Control()};
  const field = (id) => root.querySelector('#portable' + id);
  const state = {latitude: 90, longitude: 0, locationName: 'Synthetic North'};
  const getLocation = () => ({...state});
  const mount = mountPortablePlanUi({root, getPlan: () => null, getLocation});
  const store = new Map();
  const actions = createAppActions({
    state, storage: {setItem: (k,v) => store.set(k,v)},
    effects: {onStateChanged(change) {
      // Pinned app.js currently does not forward this event to portable UI.
      // When the companion app wiring calls the proposed hook, clear stale output.
      if (change.type === 'observer-location') mount.invalidateLocation?.();
    }},
  });
  field('Input').value = fixture;
  field('Import').dispatchEvent(new Event('click'));
  assert.match(field('Result').textContent, /Preview for Synthetic North/);
  assert.equal(field('Targets').children.length, 2);

  actions.setObserverLocation({latitude: -90, longitude: 0, locationName: 'Synthetic South'});
  assert.equal(state.latitude, -90);
  assert.throws(() => previewPortableAtLocation(fixture, getLocation()));
  assert.equal(field('Targets').children.length, 0, 'shown target list must not survive the location switch');
  assert.equal(field('Result').textContent, 'Observing location changed. Preview again.');
  assert.equal(field('Input').value, fixture);
  assert.equal(root.open, true);
  field('Import').dispatchEvent(new Event('click'));
  assert.match(field('Result').textContent, /Cannot preview/);
  assert.equal(field('Targets').children.length, 0);
  assert.equal(store.size, 1, 'only observer storage is written');
});
