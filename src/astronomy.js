export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const norm360 = (value) => ((value % 360) + 360) % 360;
export const norm180 = (value) => ((value + 180) % 360 + 360) % 360 - 180;

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function gmstDeg(date) {
  const jd = julianDate(date);
  const t = (jd - 2451545) / 36525;
  return norm360(
    280.46061837 +
      360.98564736629 * (jd - 2451545) +
      0.000387933 * t * t -
      (t * t * t) / 38710000,
  );
}

export function equatorialToHorizontal(ra, dec, date, latitude, longitude) {
  const hourAngle = norm180(gmstDeg(date) + longitude - ra) * DEG;
  const decRad = dec * DEG;
  const latRad = latitude * DEG;
  const sinAlt =
    Math.sin(decRad) * Math.sin(latRad) +
    Math.cos(decRad) * Math.cos(latRad) * Math.cos(hourAngle);
  const altitude = Math.asin(clamp(sinAlt, -1, 1));
  const azimuth = Math.atan2(
    -Math.sin(hourAngle) * Math.cos(decRad),
    Math.sin(decRad) * Math.cos(latRad) -
      Math.cos(decRad) * Math.sin(latRad) * Math.cos(hourAngle),
  );
  return { az: norm360(azimuth * RAD), alt: altitude * RAD };
}

export function horizontalToEquatorial(az, alt, date, latitude, longitude) {
  const azRad = az * DEG;
  const altRad = alt * DEG;
  const latRad = latitude * DEG;
  const sinDec =
    Math.sin(altRad) * Math.sin(latRad) +
    Math.cos(altRad) * Math.cos(latRad) * Math.cos(azRad);
  const dec = Math.asin(clamp(sinDec, -1, 1));
  const hourAngle = Math.atan2(
    -Math.sin(azRad) * Math.cos(altRad),
    Math.sin(altRad) * Math.cos(latRad) -
      Math.cos(altRad) * Math.sin(latRad) * Math.cos(azRad),
  );
  return {
    ra: norm360(gmstDeg(date) + longitude - hourAngle * RAD),
    dec: dec * RAD,
  };
}

// Azimuthal-equidistant view. It remains stable from a narrow field to a full dome.
export function projectHorizontal(az, alt, centerAz, centerAlt, fov, width, height) {
  const lon = az * DEG;
  const lat = alt * DEG;
  const lon0 = centerAz * DEG;
  const lat0 = centerAlt * DEG;
  const cosD =
    Math.sin(lat0) * Math.sin(lat) +
    Math.cos(lat0) * Math.cos(lat) * Math.cos(lon - lon0);
  const d = cosD > 1 - 1e-14 ? 0 : Math.acos(clamp(cosD, -1, 1));
  const bearing = Math.atan2(
    Math.sin(lon - lon0) * Math.cos(lat),
    Math.cos(lat0) * Math.sin(lat) -
      Math.sin(lat0) * Math.cos(lat) * Math.cos(lon - lon0),
  );
  // Treat fov as the field along the viewport's longest axis. This produces a
  // camera-like rectangular view instead of trapping the sky in a circular dome.
  const scale = Math.max(width, height) / (fov * DEG);
  const radius = d * scale;
  const x = width / 2 + Math.sin(bearing) * radius;
  const y = height / 2 - Math.cos(bearing) * radius;
  return {
    x,
    y,
    visible: x >= -width * 0.08 && x <= width * 1.08 && y >= -height * 0.08 && y <= height * 1.08,
    distance: d * RAD,
  };
}

export function unprojectHorizontal(x, y, centerAz, centerAlt, fov, width, height) {
  const dx = x - width / 2;
  const dy = height / 2 - y;
  const scale = Math.max(width, height) / (fov * DEG);
  const d = Math.hypot(dx, dy) / scale;
  const bearing = Math.atan2(dx, dy);
  const lat0 = centerAlt * DEG;
  const lon0 = centerAz * DEG;
  const lat = Math.asin(
    clamp(
      Math.sin(lat0) * Math.cos(d) +
        Math.cos(lat0) * Math.sin(d) * Math.cos(bearing),
      -1,
      1,
    ),
  );
  const lon =
    lon0 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(d) * Math.cos(lat0),
      Math.cos(d) - Math.sin(lat0) * Math.sin(lat),
    );
  return { az: norm360(lon * RAD), alt: lat * RAD };
}

// Gnomonic projection, matching the TAN projection requested from HiPS2FITS.
export function projectEquatorial(ra, dec, centerRa, centerDec, fov, width, height) {
  const a = ra * DEG;
  const d = dec * DEG;
  const a0 = centerRa * DEG;
  const d0 = centerDec * DEG;
  const delta = norm180(ra - centerRa) * DEG;
  const cosC = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(delta);
  if (cosC <= 0) return { x: -9999, y: -9999, visible: false };
  const gx = (Math.cos(d) * Math.sin(delta)) / cosC;
  const gy =
    (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(delta)) /
    cosC;
  // HiPS2FITS defines fov along the image width, so use that same plate scale.
  const scale = width / (2 * Math.tan((fov * DEG) / 2));
  return {
    x: width / 2 - gx * scale,
    y: height / 2 - gy * scale,
    visible: Math.abs(gx * scale) < width * 0.65 && Math.abs(gy * scale) < height * 0.65,
  };
}

export function unprojectEquatorial(x, y, centerRa, centerDec, fov, width, height) {
  const scale = width / (2 * Math.tan((fov * DEG) / 2));
  const gx = -(x - width / 2) / scale;
  const gy = -(y - height / 2) / scale;
  const rho = Math.hypot(gx, gy);
  if (rho === 0) return { ra: norm360(centerRa), dec: centerDec };
  const c = Math.atan(rho);
  const d0 = centerDec * DEG;
  const a0 = centerRa * DEG;
  const dec = Math.asin(
    Math.cos(c) * Math.sin(d0) + (gy * Math.sin(c) * Math.cos(d0)) / rho,
  );
  const ra =
    a0 +
    Math.atan2(
      gx * Math.sin(c),
      rho * Math.cos(d0) * Math.cos(c) - gy * Math.sin(d0) * Math.sin(c),
    );
  return { ra: norm360(ra * RAD), dec: dec * RAD };
}

function eccentricAnomaly(meanDegrees, eccentricity) {
  const mean = norm360(meanDegrees) * DEG;
  let eccentric = mean + eccentricity * Math.sin(mean) * (1 + eccentricity * Math.cos(mean));
  for (let i = 0; i < 8; i += 1) {
    eccentric -=
      (eccentric - eccentricity * Math.sin(eccentric) - mean) /
      (1 - eccentricity * Math.cos(eccentric));
  }
  return eccentric;
}

const ELEMENTS = {
  Mercury: [48.3313, 3.24587e-5, 7.0047, 5e-8, 29.1241, 1.01444e-5, 0.387098, 0, 0.205635, 5.59e-10, 168.6562, 4.0923344368],
  Venus: [76.6799, 2.4659e-5, 3.3946, 2.75e-8, 54.891, 1.38374e-5, 0.72333, 0, 0.006773, -1.302e-9, 48.0052, 1.6021302244],
  Earth: [0, 0, 0, 0, 282.9404, 4.70935e-5, 1, 0, 0.016709, -1.151e-9, 356.047, 0.9856002585],
  Mars: [49.5574, 2.11081e-5, 1.8497, -1.78e-8, 286.5016, 2.92961e-5, 1.523688, 0, 0.093405, 2.516e-9, 18.6021, 0.5240207766],
  Jupiter: [100.4542, 2.76854e-5, 1.303, -1.557e-7, 273.8777, 1.64505e-5, 5.20256, 0, 0.048498, 4.469e-9, 19.895, 0.0830853001],
  Saturn: [113.6634, 2.3898e-5, 2.4886, -1.081e-7, 339.3939, 2.97661e-5, 9.55475, 0, 0.055546, -9.499e-9, 316.967, 0.0334442282],
  Uranus: [74.0005, 1.3978e-5, 0.7733, 1.9e-8, 96.6612, 3.0565e-5, 19.18171, -1.55e-8, 0.047318, 7.45e-9, 142.5905, 0.011725806],
  Neptune: [131.7806, 3.0173e-5, 1.77, -2.55e-7, 272.8461, -6.027e-6, 30.05826, 3.313e-8, 0.008606, 2.15e-9, 260.2471, 0.005995147],
};

function heliocentric(name, day) {
  const e = ELEMENTS[name];
  const N = (e[0] + e[1] * day) * DEG;
  const i = (e[2] + e[3] * day) * DEG;
  const w = (e[4] + e[5] * day) * DEG;
  const a = e[6] + e[7] * day;
  const eccentricity = e[8] + e[9] * day;
  const anomaly = e[10] + e[11] * day;
  const E = eccentricAnomaly(anomaly, eccentricity);
  const xv = a * (Math.cos(E) - eccentricity);
  const yv = a * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  return {
    x: r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i)),
    y: r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i)),
    z: r * Math.sin(v + w) * Math.sin(i),
    r,
  };
}

function eclipticToEquatorial(x, y, z, day) {
  const obliquity = (23.4393 - 3.563e-7 * day) * DEG;
  const ye = y * Math.cos(obliquity) - z * Math.sin(obliquity);
  const ze = y * Math.sin(obliquity) + z * Math.cos(obliquity);
  return {
    ra: norm360(Math.atan2(ye, x) * RAD),
    dec: Math.atan2(ze, Math.hypot(x, ye)) * RAD,
    distanceAu: Math.hypot(x, y, z),
  };
}

export function solarSystemPositions(date) {
  const day = julianDate(date) - 2451543.5;
  const earth = heliocentric("Earth", day);
  const sun = eclipticToEquatorial(-earth.x, -earth.y, -earth.z, day);
  const results = [{ name: "Sun", ...sun }];

  for (const name of Object.keys(ELEMENTS)) {
    if (name === "Earth") continue;
    const planet = heliocentric(name, day);
    results.push(
      Object.assign(
        { name },
        eclipticToEquatorial(planet.x - earth.x, planet.y - earth.y, planet.z - earth.z, day),
      ),
    );
  }

  const N = (125.1228 - 0.0529538083 * day) * DEG;
  const i = 5.1454 * DEG;
  const w = (318.0634 + 0.1643573223 * day) * DEG;
  const eccentricity = 0.0549;
  const E = eccentricAnomaly(115.3654 + 13.0649929509 * day, eccentricity);
  const xv = 60.2666 * (Math.cos(E) - eccentricity);
  const yv = 60.2666 * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  const moon = eclipticToEquatorial(
    r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i)),
    r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i)),
    r * Math.sin(v + w) * Math.sin(i),
    day,
  );
  moon.distanceAu /= 23454.8;
  results.splice(1, 0, { name: "Moon", ...moon });
  return results;
}

export function angularSeparation(aRa, aDec, bRa, bDec) {
  const a = aDec * DEG;
  const b = bDec * DEG;
  const cos = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos((aRa - bRa) * DEG);
  return Math.acos(clamp(cos, -1, 1)) * RAD;
}

export function formatRa(degrees) {
  const hours = norm360(degrees) / 15;
  const h = Math.floor(hours);
  const minutes = (hours - h) * 60;
  return `${String(h).padStart(2, "0")}h ${minutes.toFixed(1).padStart(4, "0")}m`;
}

export function formatDec(degrees) {
  const sign = degrees < 0 ? "−" : "+";
  const value = Math.abs(degrees);
  return `${sign}${Math.floor(value).toString().padStart(2, "0")}° ${(value % 1 * 60).toFixed(0).padStart(2, "0")}′`;
}
