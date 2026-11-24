import test from "node:test";
import assert from "node:assert/strict";
import {
  angularSeparation,
  equatorialToHorizontal,
  formatDec,
  formatRa,
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

// JPL Horizons observer table, geocentric apparent RA/Dec (quantity 2),
// centers 500@399, DE441, sampled at the two UTC times below. A shared
// half-degree regression ceiling catches sign/antipode failures without
// requiring this educational approximation to reproduce Horizons precision.
const horizons = [
  ["2026-11-16T11:00:00Z", {
    Sun: ["15 26 54.49", "-18 47 44.7"],
    Mercury: ["14 16 48.53", "-11 14 05.0"],
    Venus: ["13 23 22.55", "-09 57 51.1"],
    Mars: ["09 55 36.83", "+14 41 20.4"],
    Jupiter: ["09 53 39.78", "+13 35 06.1"],
    Saturn: ["00 35 15.63", "+00 55 44.6"],
    Neptune: ["00 08 52.57", "-00 34 19.0"],
  }],
  ["2027-02-09T00:00:00Z", {
    Sun: ["21 29 36.73", "-14 48 53.8"],
    Mercury: ["22 27 58.58", "-07 31 25.0"],
    Venus: ["18 26 39.89", "-21 15 12.9"],
    Mars: ["10 33 28.88", "+13 50 30.8"],
    Jupiter: ["09 40 04.71", "+15 04 06.8"],
    Saturn: ["00 44 02.46", "+02 13 04.8"],
    Neptune: ["00 11 28.32", "-00 14 03.8"],
  }],
];

function sexagesimal(text) {
  const [degrees, minutes, seconds] = text.replace(/^[+-]/, "").split(" ").map(Number);
  return (text.startsWith("-") ? -1 : 1) * (degrees + minutes / 60 + seconds / 3600);
}

for (const [time, reference] of horizons) {
  test(`geocentric Sun and planet positions match approximate JPL Horizons directions at ${time}`, () => {
    const objects = solarSystemPositions(new Date(time));
    for (const [name, [ra, dec]] of Object.entries(reference)) {
      const actual = objects.find((object) => object.name === name);
      close(angularSeparation(actual.ra, actual.dec, 15 * sexagesimal(ra), sexagesimal(dec)), 0, 0.5, name);
    }
  });
}

test("Mars and Jupiter are closely paired on NASA's November 2026 skywatching date", () => {
  const objects = solarSystemPositions(new Date("2026-11-16T11:00:00Z"));
  const mars = objects.find((object) => object.name === "Mars");
  const jupiter = objects.find((object) => object.name === "Jupiter");
  close(angularSeparation(mars.ra, mars.dec, jupiter.ra, jupiter.dec), 1.2, 0.3, "Mars–Jupiter pairing");
});

test("right ascension rounding carries into the next hour", () => {
  assert.equal(formatRa(29.98), "01h 59.9m");
  assert.equal(formatRa(29.99), "02h 00.0m");
});

test("right ascension rounding wraps at midnight and normalizes negative angles", () => {
  assert.equal(formatRa(359.99), "00h 00.0m");
  assert.equal(formatRa(-0.01), "00h 00.0m");
  assert.equal(formatRa(360.25), "00h 01.0m");
});

test("declination rounding carries into the next degree and preserves hemisphere", () => {
  assert.equal(formatDec(44.99), "+44° 59′");
  assert.equal(formatDec(44.999), "+45° 00′");
  assert.equal(formatDec(-44.999), "−45° 00′");
});

test("declination rounding reaches both poles without overflowing them", () => {
  assert.equal(formatDec(89.999), "+90° 00′");
  assert.equal(formatDec(-89.999), "−90° 00′");
  assert.equal(formatDec(-0.001), "−00° 00′");
});
