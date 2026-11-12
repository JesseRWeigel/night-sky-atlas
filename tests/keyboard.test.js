import test from 'node:test';
import assert from 'node:assert/strict';
import { skyShortcut } from '../src/keyboard.js';
const canvas = { tagName: 'CANVAS', closest: () => null };
const event = (key, extras = {}) => ({ key, target: canvas, ...extras });
test('sky keys and slash work on the canvas', () => {
 for (const key of [' ', '+', '=', '-', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) assert.equal(skyShortcut(event(key), canvas), 'sky');
 assert.equal(skyShortcut(event('/'), canvas), 'search');
 assert.equal(skyShortcut(event('Tab'), canvas), null);
});
test('controls and their descendants keep every key, including slash and Space', () => {
 for (const kind of ['input','textarea','select','button','a','summary','[role="textbox"]','[contenteditable]']) {
  const target = { closest: selector => { assert.ok(selector.includes(kind.replace('[contenteditable]', '[contenteditable]'))); return {}; } };
  for (const key of [' ', '/', '+', '-', 'ArrowDown']) assert.equal(skyShortcut(event(key, {target}), canvas), null);
 }
});
test('modifiers, composition and previously handled events are ignored', () => {
 for (const flag of ['ctrlKey','metaKey','altKey','isComposing','defaultPrevented']) for(const key of ['/', ' ', 'ArrowDown']) assert.equal(skyShortcut(event(key, {[flag]:true}),canvas),null);
});
test('unrelated panels retain arrow scrolling; body retains sky controls', () => {
 assert.equal(skyShortcut(event('ArrowDown',{target:{tagName:'DIV'}}),canvas),null);
 assert.equal(skyShortcut(event('ArrowDown',{target:{tagName:'BODY'}}),canvas),'sky');
});
