import test from "node:test";
import assert from "node:assert/strict";
import { createLocationRequest } from "../src/location-request.js";

function setup(getGeolocation) {
  const attempts = [];
  const messages = [];
  const applied = [];
  const controller = createLocationRequest({
    getGeolocation: getGeolocation ?? (() => ({
      getCurrentPosition(success, failure, options) { attempts.push({ success, failure, options }); },
    })),
    showMessage: (text) => messages.push(text),
    apply: (...coordinates) => applied.push(coordinates),
  });
  return { controller, attempts, messages, applied };
}

const fix = { coords: { latitude: 40.12345, longitude: -80.12345, accuracy: 20.4 } };

test("manual observing location can invalidate a pending device result", () => {
  const { controller, attempts, messages, applied } = setup();
  controller.request();
  assert.equal(attempts[0].options.timeout, 12000);
  controller.invalidate();
  attempts[0].success(fix);
  assert.deepEqual(applied, []);
  assert.equal(messages.at(-1), "");
});

test("only the most recent request gets to change the observing location or status", () => {
  const { controller, attempts, messages, applied } = setup();
  controller.request();
  controller.request();
  attempts[0].failure({ message: "Denied" });
  assert.equal(messages.at(-1), "Requesting your location…");
  attempts[1].success(fix);
  assert.deepEqual(applied, [[40.12345, -80.12345]]);
  controller.invalidate();
  attempts[0].success(fix);
  assert.equal(applied.length, 1);
  assert.equal(messages.at(-1), "");
});

test("normal completion reports accuracy even if applying it synchronizes the observer controls", () => {
  let success;
  let message;
  const controller = createLocationRequest({
    getGeolocation: () => ({ getCurrentPosition(cb) { success = cb; } }),
    showMessage: (text) => { message = text; },
    apply: () => controller.invalidate(),
  });
  controller.request();
  success(fix);
  assert.equal(message, "Location accurate to about 20 m.");
});

test("missing, blocked and denied geolocation leave manual observing controls usable", () => {
  const missing = setup(() => undefined);
  missing.controller.request();
  assert.match(missing.messages.at(-1), /does not provide/);
  const blocked = setup(() => { throw new DOMException("Blocked", "SecurityError"); });
  blocked.controller.request();
  assert.equal(blocked.messages.at(-1), "Location unavailable: Blocked");
  const denied = setup();
  denied.controller.request();
  denied.attempts[0].failure({ message: "Permission denied" });
  assert.equal(denied.messages.at(-1), "Location unavailable: Permission denied");
});
