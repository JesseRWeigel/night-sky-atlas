import test from "node:test";
import assert from "node:assert/strict";
import {
  angularSeparation,
  equatorialToHorizontal,
  gmstDeg,
  horizontalToEquatorial,
  julianDate,
  norm180,
  projectEquatorial,
  projectHorizontal,
  solarSystemPositions,
  unprojectEquatorial,
  unprojectHorizontal,
} from "../src/astronomy.js";

const close = (actual, expected, tolerance, message = "") => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} expected ${expected} ± ${tolerance}, got ${actual}`);
};

test("Julian date matches the J2000 epoch", () => {
  close(julianDate(new Date("2000-01-01T12:00:00Z")), 2451545, 1e-9);
});

test("Greenwich mean sidereal time matches a published reference epoch", () => {
  close(gmstDeg(new Date("2000-01-01T12:00:00Z")), 280.46061837, 1e-6);
});

test("equatorial and horizontal transforms round-trip", () => {
  const date = new Date("2026-07-11T03:30:00Z");
  const observer = { latitude: 40.7128, longitude: -74.006 };
  const source = { ra: 279.2347, dec: 38.7837 };
  const horizontal = equatorialToHorizontal(source.ra, source.dec, date, observer.latitude, observer.longitude);
  const restored = horizontalToEquatorial(horizontal.az, horizontal.alt, date, observer.latitude, observer.longitude);
  close(norm180(restored.ra - source.ra), 0, 1e-9, "right ascension");
  close(restored.dec, source.dec, 1e-9, "declination");
});

test("horizontal projection centers and round-trips a point", () => {
  const center = projectHorizontal(185, 55, 185, 55, 70, 1000, 700);
  close(center.x, 500, 1e-9);
  close(center.y, 350, 1e-9);

  const projected = projectHorizontal(200, 42, 185, 55, 70, 1000, 700);
  const restored = unprojectHorizontal(projected.x, projected.y, 185, 55, 70, 1000, 700);
  close(norm180(restored.az - 200), 0, 1e-9);
  close(restored.alt, 42, 1e-9);
});

test("gnomonic survey projection centers and round-trips a point", () => {
  const center = projectEquatorial(10, 41, 10, 41, 6, 1200, 800);
  close(center.x, 600, 1e-9);
  close(center.y, 400, 1e-9);

  const projected = projectEquatorial(12.2, 40.1, 10, 41, 6, 1200, 800);
  const restored = unprojectEquatorial(projected.x, projected.y, 10, 41, 6, 1200, 800);
  close(norm180(restored.ra - 12.2), 0, 1e-9);
  close(restored.dec, 40.1, 1e-9);
});

test("solar system ephemeris returns finite positions for every major planet", () => {
  const objects = solarSystemPositions(new Date("2026-07-11T00:00:00Z"));
  assert.deepEqual(objects.map((object) => object.name), [
    "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune",
  ]);
  for (const object of objects) {
    assert.ok(Number.isFinite(object.ra), `${object.name} RA should be finite`);
    assert.ok(Number.isFinite(object.dec), `${object.name} declination should be finite`);
    assert.ok(object.ra >= 0 && object.ra < 360, `${object.name} RA should be normalized`);
    assert.ok(object.dec >= -90 && object.dec <= 90, `${object.name} declination should be physical`);
    assert.ok(object.distanceAu > 0, `${object.name} distance should be positive`);
  }
});

test("angular separation is zero for identical coordinates and 90° for quadrature", () => {
  close(angularSeparation(12, -30, 12, -30), 0, 1e-6);
  close(angularSeparation(0, 0, 90, 0), 90, 1e-10);
});
