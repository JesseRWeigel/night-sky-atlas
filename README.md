# Night Sky Atlas

[![MIT License](https://img.shields.io/badge/license-MIT-67c9ff.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-11%20passing-61f2da.svg)](#run-locally)
[![WebXR](https://img.shields.io/badge/Meta%20Quest-WebXR-8bd9ff.svg)](#meta-quest-and-webxr)

**[Open the live planetarium](https://jesserweigel.github.io/night-sky-atlas/)**

Night Sky Atlas is a browser-based planetarium that renders the sky for any
date, time, latitude, and longitude. Zoom from a naked-eye horizon view into
real optical or infrared survey imagery, then select stars, planets, and
deep-sky objects for scientific facts and credited photographs.

## Features

- Time-aware, horizon-facing sky with cardinal directions, altitude guides,
  constellation lines, bright stars, planets, and major deep-sky objects.
- Editable UTC time and observer coordinates, browser geolocation, preset
  observing sites, and reversible time playback from hours to years per second.
- Mouse, trackpad, touch controls, and keyboard navigation with object search and a
  one-click “Tonight” reset.
- Automatic deep-survey mode at narrow fields of view using real imagery from
  the CDS HiPS2FITS service. Auto mode prefers Pan-STARRS where coverage and
  scale permit, then falls back to DSS2; 2MASS infrared is also selectable.
- Clickable catalog objects with type, distance, composition, mass (when
  meaningful and known), coordinates, observing notes, and curated images for
  well-known targets.
- Explicit image/survey attribution in the interface; no API key or backend.
- A local catalog and procedural rendering keep the planetarium useful when
  survey images are unavailable.
- An immersive WebXR planetarium for Meta Quest with a desktop 3D preview,
  head tracking, controller rays, object selection, and in-headset facts.

## Run locally

Requires Python 3 for the tiny static server and Node.js 20+ for tests.

```bash
cd night-sky-atlas
npm run dev
```

Open <http://localhost:4173>. Run the astronomy unit tests with:

```bash
npm test
```

Opening `index.html` directly is not supported because browsers restrict ES
modules loaded from `file://` URLs.

## Meta Quest and WebXR

The **VR mode** button opens a separate Three.js celestial-sphere renderer that
shares the same time, location, astronomy calculations, and object catalog as
the desktop atlas.

1. Open the [published site](https://jesserweigel.github.io/night-sky-atlas/)
   in Meta Quest Browser.
2. Choose **VR mode**, then **Enter VR**.
3. Look around naturally. Point either controller at a star, planet, galaxy,
   nebula, or cluster and press the trigger to open its in-headset fact panel.

The saved observer location carries into VR. The VR page also includes time
controls before entering the headset session. On a desktop without WebXR, use
**Explore in 3D preview**, then drag to look, scroll to zoom, and click objects.

WebXR immersive sessions require HTTPS, which the GitHub Pages deployment
provides. The 3D renderer loads Three.js 0.180 from jsDelivr; an internet
connection is therefore required when entering VR.

## Controls

- Drag to look around; scroll or use the on-screen controls to zoom.
- Use `+`/`-` to zoom, arrow keys to pan, `/` to focus search, and Space to
  pause/resume time.
- At wide fields the display is a local rectangular horizon view. Below a 28° field of view
  it transitions to an equatorial survey view centered on the same direction.

Planet positions use compact, low-precision orbital elements intended for an
educational sky finder, not spacecraft navigation or occultation prediction.
Stellar positions are J2000 with precession omitted at ordinary historical
dates. Dates far outside 1900–2100 should be treated as illustrative.

## Data and image sources

- Star coordinates and properties: the public-domain Yale Bright Star Catalog
  and SIMBAD literature values, curated into `src/catalog.js`.
- Deep-sky coordinates and properties: public Messier/OpenNGC catalog values,
  curated into `src/catalog.js`.
- Survey imagery: [CDS HiPS2FITS](https://alasky.cds.unistra.fr/hips-image-services/hips2fits),
  serving DSS2 color, Pan-STARRS DR1, and 2MASS color surveys. Individual survey
  credits are always shown in the viewer.
- Curated object photographs: NASA/ESA mission pages and Wikimedia Commons.
  Each photograph carries its own source and credit link in the details panel.

Remote imagery remains subject to its source archive's terms. The MIT license
covers this project's code and locally authored content, not third-party images
returned by remote services.

## Architecture

This is intentionally a zero-build static application:

- `src/astronomy.js` — coordinate transforms, sidereal time, projections, and
  approximate Solar System ephemerides.
- `src/catalog.js` — the curated object catalog, constellation line segments,
  and photograph metadata.
- `src/app.js` — interaction, state, canvas renderer, survey loading, search,
  details, and responsive UI.
- `vr.html`, `vr.css`, and `src/vr.js` — WebXR/Meta Quest celestial sphere,
  controller selection, 3D information panels, and desktop preview.
- `tests/astronomy.test.js` — deterministic checks for the numerical core.
- `tests/catalog.test.js` — catalog completeness and attribution checks.

## Contributing

Issues and pull requests are welcome. Please keep catalog additions sourced,
include image attribution, avoid hotlinking sources that prohibit it, and add a
test when changing coordinate or projection math.

## License

Code is released under the permissive [MIT License](LICENSE).
