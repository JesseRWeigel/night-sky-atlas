# Night Sky Atlas — Plan the Sky Together

[![MIT License](https://img.shields.io/badge/license-MIT-67c9ff.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-80%20passing-61f2da.svg)](#run-locally)
[![WebXR](https://img.shields.io/badge/Meta%20Quest-WebXR-8bd9ff.svg)](#meta-quest-and-webxr)

**[Open the live planetarium](https://jesserweigel.github.io/night-sky-atlas/)**

Night Sky Atlas is a browser-based planetarium and shared observing planner. A
person can explore the sky, then use an AI agent through WebMCP to find targets,
preview a route in the same visible atlas, and save or advance that route only
when the person is ready. The app is a static, zero-build site: it has no
backend, account, or API key.

## Before and after WebMCP

The July 22, 2026 baseline at commit
[`81672ede79762cbf3aadfe23a8dc9eee32013f94`](https://github.com/jesserweigel/night-sky-atlas/tree/81672ede79762cbf3aadfe23a8dc9eee32013f94)
was an interactive planetarium: choose a place and time, explore objects, and
inspect survey imagery. The August 28, 2026 extension adds a persistent,
human-editable observing plan and ten WebMCP tools. Agents now use the same
catalog, observing calculations, application actions, and visible state as the
person using the site.

## Plan an observing session manually

1. Select **Plan**, then create a plan from objects you select in the atlas.
2. Edit the title, audience, duration, notes, and target order. The planner
   shows each target's scheduled slot and minimum altitude.
3. Save the plan, then start the tour to frame targets and advance the
   observer time one slot at a time.

The observer location and saved observing plan are stored locally in the browser.
Clearing site data removes that local state. A plan may propose a different
location, but the agent preview deliberately does not change the current
location or time.

## WebMCP: an agent-visible, human-visible route

When Site tools are available, the top-level page registers imperative tools
through `document.modelContext.registerTool`. In the ChatGPT desktop app's
built-in browser, use GPT-5.6 Sol or GPT-5.6 Terra and enable Site tools; tool
availability also depends on the current rollout and page. The site preserves
the regular manual experience when WebMCP is unavailable.

The tools have strict schemas. Read tools report `readOnlyHint: true`; write
tools have `readOnlyHint: false` and visibly update the same atlas.

| Type | Tool | What it does |
| --- | --- | --- |
| Read | `get_sky_context` | Reads observer, view, layers, selection, and plan summary. |
| Read | `find_observable_targets` | Finds catalog targets meeting requested constraints. |
| Read | `get_target_details` | Reads science and observing details for one target. |
| Write | `set_observer_location` | Sets visible observer coordinates. |
| Write | `set_observer_time` | Sets visible time and pauses playback. |
| Write | `frame_target` | Selects and centers a target. |
| Write | `preview_observing_plan` | Shows an agent plan without changing observer location or time. |
| Write | `save_observing_plan` | Converts a preview into the saved route. |
| Write | `advance_observing_tour` | Starts, steps through, or jumps within the saved route. |
| Write | `configure_sky_layers` | Updates visible layers or survey source. |

The intended safety sequence is **read → find → preview → inspect → mutate →
save**. In particular, `preview_observing_plan` makes the proposed New York
route visible while the current London observer and time stay unchanged; only a
subsequent `set_observer_location` or `set_observer_time` mutates them.

For a manual Site-tools check, open the live site in the ChatGPT built-in
browser with Sol or Terra, open **Available site tools**, and ask:

> Build a 30-minute stargazing session for a child in New York tonight. Include one planet, one bright star, and one deep-sky object, keep every target above 25°, and avoid changing my location without showing me the plan first.

Confirm that the agent calls `get_sky_context`, finds targets, and calls
`preview_observing_plan` before it changes the observer. Inspect the visible
**Agent preview**; then approve the location/time updates, save the plan, and
advance the tour.

## Run locally

Requires Python 3 for the tiny static server and Node.js **18.19.1 or later**
for the verified checks.

```bash
cd night-sky-atlas
npm run dev
```

Open <http://localhost:4173>. Run the full suite with:

```bash
npm test
npm run check
```

`npm run check` performs syntax checks and runs the test suite. There is no
separate linter or build step. The final documented suite is **81 tests
passing** on Node 18.19.1.

Opening `index.html` directly is not supported because browsers restrict ES
modules loaded from `file://` URLs.

## Meta Quest and WebXR

The **VR mode** button opens a separate Three.js celestial-sphere renderer that
shares the same time, location, astronomy calculations, and object catalog as
the desktop atlas.

1. Open the [published site](https://jesserweigel.github.io/night-sky-atlas/)
   in Meta Quest Browser.
2. Choose **VR mode**, then **Enter VR**.
3. Look upward from the eye-level horizon ring. Point either controller's blue
   beam at a star, planet, galaxy, nebula, or cluster. The reticle turns green
   when it locks on; press the trigger to open a fact panel in front of you.
4. Push either thumbstick up or down to magnify labels and objects. Press A or X
   to show the in-headset controls card again, and B or Y to close details.

The saved observer location carries into VR. The VR page also includes time
controls before entering the headset session. On a desktop without WebXR, use
**Explore in 3D preview**, then drag to look, scroll to zoom, and click objects.

WebXR immersive sessions require HTTPS, which the GitHub Pages deployment
provides. The 3D renderer loads Three.js 0.180 from jsDelivr; an internet
connection is therefore required when entering VR.

## Controls and limitations

- Drag to look around; scroll or use the on-screen controls to zoom.
- Use `+`/`-` to zoom, arrow keys to pan, `/` to focus search, and Space to
  pause/resume time.
- At wide fields the display is a local rectangular horizon view. Below a 28°
  field of view it transitions to an equatorial survey view centered on the
  same direction.

Planet positions use compact, low-precision orbital elements intended for an
educational sky finder, not spacecraft navigation or occultation prediction.
Stellar positions are J2000 with precession omitted at ordinary historical
dates. Dates far outside 1900–2100 should be treated as illustrative.

## Data, images, and attribution

- Star coordinates and properties: public-domain Yale Bright Star Catalog and
  SIMBAD literature values, curated into `src/catalog.js`.
- Deep-sky coordinates and properties: curated Messier/OpenNGC-derived facts in
  `src/catalog.js`.
- Survey imagery: [CDS HiPS2FITS](https://alasky.cds.unistra.fr/hips-image-services/hips2fits),
  serving DSS2 color, Pan-STARRS DR1, and 2MASS color surveys. Individual
  survey credits are shown in the viewer.
- Curated object photographs: NASA, ESA, ESO, and Wikimedia Commons sources.
  Each object with an image has embedded file, credit, and source metadata; the
  details panel links to the original file and license information.
- Typography: Google Fonts DM Sans and Manrope. WebXR imports Three.js 0.180
  from jsDelivr.

Remote images and surveys remain subject to their source archives' terms. The
[MIT License](LICENSE) covers this project's code and locally authored
content; it does not relicense remote images. See the complete
[attribution audit](docs/submission/attribution.md).

## Architecture

This is intentionally a zero-build static application:

- `src/astronomy.js` — coordinate transforms, sidereal time, projections, and
  approximate Solar System ephemerides.
- `src/catalog.js` — curated object catalog, constellation line segments, and
  per-image metadata.
- `src/observing.js` — altitude-aware observing calculations and target search.
- `src/plan-store.js` — local plan persistence and validation.
- `src/app-actions.js` — shared manual and WebMCP application actions.
- `src/plan-ui.js`, `plan.css` — accessible planner rail and tour controls.
- `src/webmcp.js` — strict imperative WebMCP tool definitions and registration.
- `src/app.js` — rendering, controls, survey loading, planner integration, and
  responsive UI.
- `vr.html`, `vr.css`, `src/vr.js` — WebXR/Meta Quest celestial sphere,
  controller selection, 3D information panels, and desktop preview.
- `tests/` — deterministic astronomy, catalog, planner, WebMCP, UI, and static
  integration checks.

## Challenge materials

Local, final-ready copy and recording guidance live in:

- [Devpost description](docs/submission/devpost.md)
- [Two-minute-fifty-second demo script](docs/submission/demo.md)
- [Submission checklist](docs/submission/checklist.md)
- [Attribution and license audit](docs/submission/attribution.md)

## Contributing

Issues and pull requests are welcome. Please keep catalog additions sourced,
include image attribution, avoid hotlinking sources that prohibit it, and add a
test when changing coordinate or projection math.

## License

Code is released under the permissive [MIT License](LICENSE).
