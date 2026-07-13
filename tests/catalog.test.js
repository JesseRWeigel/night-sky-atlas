import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, DEEP_SKY, SOLAR_SYSTEM_INFO, STARS } from "../src/catalog.js";

test("catalog contains a substantial set of major naked-eye and deep-sky landmarks", () => {
  assert.ok(STARS.length >= 55, `expected at least 55 bright stars, found ${STARS.length}`);
  assert.ok(DEEP_SKY.length >= 25, `expected at least 25 major deep-sky objects, found ${DEEP_SKY.length}`);
  for (const expected of ["Sirius", "Canopus", "Rigil Kentaurus", "Arcturus", "Vega", "Capella", "Rigel", "Betelgeuse", "Polaris"]) {
    assert.ok(STARS.some((star) => star.name === expected), `${expected} is missing`);
  }
  for (const expected of ["Andromeda Galaxy", "Orion Nebula", "Pleiades", "Crab Nebula", "Whirlpool Galaxy", "Carina Nebula"]) {
    assert.ok(DEEP_SKY.some((object) => object.name === expected), `${expected} is missing`);
  }
});

test("every selectable catalog object has coordinates and requested scientific facts", () => {
  const ids = new Set();
  for (const object of CATALOG) {
    assert.ok(object.id && !ids.has(object.id), `duplicate or missing id: ${object.id}`);
    ids.add(object.id);
    assert.ok(object.name, `${object.id} has no name`);
    assert.ok(object.type, `${object.name} has no type`);
    assert.ok(Number.isFinite(object.ra) && object.ra >= 0 && object.ra < 360, `${object.name} has invalid RA`);
    assert.ok(Number.isFinite(object.dec) && object.dec >= -90 && object.dec <= 90, `${object.name} has invalid declination`);
    assert.ok(object.distance, `${object.name} has no distance`);
    assert.ok(object.mass, `${object.name} has no mass or explicit unknown value`);
    assert.ok(object.composition, `${object.name} has no composition`);
    assert.ok(object.summary, `${object.name} has no summary`);
  }
});

test("Solar System catalog covers the Sun, Moon, and seven planets observable from Earth", () => {
  assert.deepEqual(Object.keys(SOLAR_SYSTEM_INFO), ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]);
  for (const [name, object] of Object.entries(SOLAR_SYSTEM_INFO)) {
    for (const field of ["type", "distance", "mass", "composition", "summary"]) {
      assert.ok(object[field], `${name} has no ${field}`);
    }
  }
});

test("every curated photograph carries file, creator/license credit, and source metadata", () => {
  const images = [...DEEP_SKY, ...Object.values(SOLAR_SYSTEM_INFO)].map((object) => object.image).filter(Boolean);
  assert.ok(images.length >= 25, `expected at least 25 credited photographs, found ${images.length}`);
  for (const image of images) {
    assert.ok(image.file, "image file is missing");
    assert.ok(image.credit, `${image.file} is missing a creator/license credit`);
    assert.ok(image.source, `${image.file} is missing a source`);
  }
});
