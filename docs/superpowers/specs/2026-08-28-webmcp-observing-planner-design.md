# WebMCP Collaborative Observing Planner Design

**Status:** Approved in chat on August 28, 2026

**Baseline:** `81672ede79762cbf3aadfe23a8dc9eee32013f94` (`main`, July 22, 2026)

## Purpose

Extend Night Sky Atlas from a planetarium into a collaborative observing planner where a person and an AI agent work with the same visible sky, proposed plan, saved itinerary, and tour progress. The result remains a zero-build static GitHub Pages application and preserves the existing canvas, search, object inspector, time controls, location controls, layers, deep-survey behavior, and WebXR mode.

The defining demonstration is:

> Build a 30-minute stargazing session for a child in New York tonight. Include one planet, one bright star, and one deep-sky object, keep every target above 25°, and avoid changing my location without showing me the plan first.

The application must make the collaboration visible. WebMCP tools are not hidden wrappers: tool calls use the same application actions as the normal interface, and every state-changing call has an observable UI result.

## Constraints and source-of-truth requirements

- Preserve static deployment with browser-native ES modules. Do not add a backend, API key, paid service, framework migration, or build step.
- Register tools imperatively with `document.modelContext.registerTool()` from the top-level page. The ChatGPT built-in browser does not discover declarative tools or tools registered inside iframes.
- Guard registration with `typeof document.modelContext?.registerTool === "function"` so the normal interface works when WebMCP is unavailable.
- Use JSON Schema objects with `additionalProperties: false`, bounded strings and arrays, explicit enums, and numeric ranges.
- Set `annotations.readOnlyHint: true` only on tools that make no in-memory, persisted, or visible UI changes. The current WebMCP draft defines `readOnlyHint` and `untrustedContentHint`; it does not define MCP's destructive or idempotent hints.
- Do not push, deploy, publish, upload, or submit without explicit user approval.
- Treat `81672ede79762cbf3aadfe23a8dc9eee32013f94` as the documented pre-hackathon application baseline.

References:

- [OpenAI Site tools documentation](https://learn.chatgpt.com/docs/webmcp)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [WebMCP Challenge rules](https://webmcp.devpost.com/rules)

## Architecture

The current `src/app.js` owns mutable state, astronomy-derived catalogs, persistence, rendering, DOM updates, and event handlers. The extension will keep rendering and browser event binding there while extracting planner behavior into small modules with explicit interfaces.

### `src/observing.js`

Pure astronomy and plan-domain logic. It imports coordinate transforms and catalog data but never reads the DOM or browser storage.

Exports:

- `buildCatalogAt(date)` returns the static catalog plus Solar System objects calculated for the supplied date.
- `getTargetAtContext(targetId, context)` resolves a target and derives altitude and azimuth.
- `findObservableTargets(catalog, context, filters)` returns sorted target summaries without modifying application state.
- `previewObservingPlan(catalog, request)` validates the request, assigns observation slots, verifies constraints, and returns a complete preview.
- `validateObservingPlan(plan, catalog)` validates persisted or tool-provided plan data.
- `targetCategory(object)` returns `planet`, `bright_star`, or `deep_sky`, with the Sun, Moon, and non-planet Solar System objects excluded from `planet`.

### `src/plan-store.js`

Versioned serialization with dependency injection so it can be tested without a browser.

Exports:

- `PLAN_STORAGE_KEY = "night-sky-observing-plan:v1"`.
- `savePlan(storage, plan)` validates and stores JSON.
- `loadPlan(storage)` returns a valid plan or `null`; malformed or obsolete data does not crash startup.
- `clearPlan(storage)` removes only the planner key.

### `src/app-actions.js`

Reusable application actions. A factory receives the live state, domain functions, persistence, and a small UI-effects adapter. UI event handlers and WebMCP handlers call the same methods.

The action surface is:

- `getSkyContext()`
- `findObservableTargets(filters)`
- `getTargetDetails(targetId)`
- `setObserverLocation(input)`
- `setObserverTime(input)`
- `frameTarget(input)`
- `previewPlan(input)`
- `savePlan(input)`
- `advanceTour(input)`
- `configureLayers(input)`
- `createManualPlan(input)`
- `addTargetToPlan(targetId)`
- `updatePlan(input)`
- `removeTargetFromPlan(targetId)`
- `movePlanTarget(input)`

Each mutation calls one `onStateChanged(change)` effect with a typed change name. The adapter in `app.js` updates controls, rendering state, the inspector, and the plan rail. Actions return concise serializable results suitable for UI confirmation and WebMCP output.

### `src/plan-ui.js`

Owns only observing-plan DOM rendering and event delegation. It receives the action surface and renders from state snapshots; it does not calculate astronomy or persist data directly.

### `src/webmcp.js`

Exports tool definitions independently from browser registration:

- `createWebMcpTools(actions)` returns the ten definitions for unit testing.
- `registerWebMcpTools(modelContext, tools)` registers all definitions and returns a summary.
- `setupWebMcp(actions, document)` performs guarded browser setup and reports unavailable support without throwing.

Tool handlers catch validation errors and return a consistent `{ ok: false, error: { code, message, details? } }` result. Unexpected programmer errors are rethrown so tests and browser diagnostics do not hide defects.

### Existing files

- `src/app.js` retains canvas rendering, survey loading, inspector rendering, and browser event binding. Existing mutations are replaced with calls to application actions where they overlap the shared action surface.
- `index.html` adds the plan toggle, rail markup, manual editing controls, and an “Add to plan” action in the object inspector.
- `styles.css` retains the existing atlas visual system. Planner-specific styles live in `plan.css`, loaded after `styles.css`, to avoid adding a fourth override layer to the already long stylesheet.
- `src/vr.js` remains behaviorally unchanged. It continues reading the same saved observer location.

## State and data model

The live application state gains:

```js
{
  plan: null,
  planPreview: null,
  planPanelOpen: false,
  tour: { active: false, currentIndex: -1 }
}
```

An observing context is:

```js
{
  date: "2026-08-29T00:30:00.000Z",
  latitude: 40.7128,
  longitude: -74.006,
  locationName: "New York City"
}
```

A persisted plan is:

```js
{
  version: 1,
  id: "plan-<uuid-or-time-based-id>",
  title: "A child's first look at the summer sky",
  audience: "child",
  notes: "Start with the brightest, easiest target.",
  durationMinutes: 30,
  categoryRequirements: { planet: 1, bright_star: 1, deep_sky: 1 },
  context: { date, latitude, longitude, locationName },
  status: "saved",
  currentIndex: -1,
  createdAt: "<ISO timestamp>",
  updatedAt: "<ISO timestamp>",
  targets: [
    {
      targetId: "planet-jupiter",
      name: "Jupiter",
      category: "planet",
      startOffsetMinutes: 0,
      durationMinutes: 10,
      scheduledTime: "<ISO timestamp>",
      altitude: 32.4,
      azimuth: 101.2,
      status: "upcoming"
    }
  ]
}
```

`status` is `preview` or `saved`. Target status is `upcoming`, `current`, or `complete`. Persisted calculations are informative snapshots; tour advancement recalculates current altitude and azimuth from target coordinates, the plan location, and the target's scheduled time.

Preview IDs are held in memory and are not restored after reload. Saving requires the current preview ID, preventing an agent from committing a stale or different proposal.

## Planning and visibility behavior

- Supported plan duration is 10–180 minutes.
- Supported target count is 1–12.
- Minimum altitude is constrained to 0–90° and defaults to 20°.
- Each target is evaluated at the midpoint of its assigned slot. “Keep every target above 25°” therefore means each selected target is at least 25° high when its observation begins and remains above 25° at the slot midpoint and end.
- Plan validation samples the start, midpoint, and end of each target slot and reports the lowest sampled altitude.
- Slots divide total duration evenly; remainder minutes are assigned from the first target forward so total slot time exactly equals plan duration.
- `find_observable_targets` evaluates candidates at the requested context time and sorts by category match, altitude descending, then magnitude ascending.
- Bright stars are catalog objects with `type === "Star"`, magnitude at or below the requested maximum, and are not calculated planets.
- Deep-sky objects are catalog entries in `DEEP_SKY`.
- Optional category requirements specify exact counts from 0–12 for `planet`, `bright_star`, and `deep_sky`. The provided target IDs must satisfy every nonzero requirement. A planet cannot satisfy a star requirement even though the Sun is physically a star.
- Previewing with a proposed observer context does not modify the current observer location or time.
- Saving a preview persists the plan and displays it but does not modify observer location or time.
- Starting or advancing a tour changes the observer time to the selected target's scheduled time, frames and selects the target, updates progress, and opens the plan rail. It never changes observer location. If current and plan locations differ, the action returns `LOCATION_MISMATCH` with both locations and leaves tour state unchanged.

## Visible experience

### Planner rail

The new top-bar `Plan` chip shows the number of targets and progress. It opens a left-side rail below the header on desktop and a bottom drawer on narrow screens. The existing object inspector continues to slide from the right.

The rail uses the existing black, blue, cyan, and white palette with a restrained amber accent for scheduled time. DM Sans remains the body face, Manrope the display/data face. The signature element is a “constellation thread”: target nodes connected by a fine plotted route, with each node displaying target category, scheduled time, sampled altitude, and progress. This uses the visual language of a sky chart instead of a generic task list.

The rail has four states:

1. **Empty:** explains how to select a target and add it, with a `Create plan` action.
2. **Editing:** title, audience, notes, duration, target reorder/remove controls, validation summary, `Save plan`, and `Start tour` when valid.
3. **Preview:** prominently labeled `Agent preview`; shows proposed observer context and constraints, with `Save this plan` and `Dismiss preview`. Location and time controls remain visibly unchanged.
4. **Tour:** highlights the current target, completed nodes, next target, and `Previous`/`Next` controls. Clicking a node uses the same tour action with an explicit index.

The object inspector gains an `Add to plan` button next to `Center`. Search remains the path for manually finding objects. Adding a duplicate target focuses the existing plan item and announces that it is already included.

### Mutation feedback

Every action that changes state updates an `aria-live="polite"` status region in the rail. Tool-originated changes use plain messages such as “Previewed a 30-minute plan with 3 targets” or “Tour moved to Vega, target 2 of 3.” Location, time, framing, and layer tools also update their existing controls and visible sky.

### Responsive and accessible behavior

- Desktop planner rail width: 340px, with a maximum that keeps at least 55% of the sky visible at common laptop widths.
- At 760px and below, the rail becomes a bottom drawer with a maximum height of 82vh.
- All controls are native buttons, inputs, selects, or textareas with associated labels.
- Target reorder buttons use explicit “Move [target] earlier/later” labels; drag-and-drop is not required.
- Focus moves into an opened rail and returns to the toggle on close. Escape closes the topmost drawer or floating panel.
- Tour progress is expressed in text as well as color.
- Reduced-motion preferences disable rail and progress animation.
- Pointer targets are at least 40px on mobile.

## WebMCP tools

All schemas are JSON objects with `additionalProperties: false`.

| Tool | Read-only | Input | Result and visible behavior |
| --- | --- | --- | --- |
| `get_sky_context` | Yes | Empty object | Current ISO time, observer location, view direction/FOV, layers, selected target, and plan summary. No UI change. |
| `find_observable_targets` | Yes | `categories` (1–3 unique enum values), `min_altitude` (0–90), optional `max_magnitude` (-30–15), optional `at_time` (ISO), `limit` (1–12) | Matching IDs, names, categories, magnitude, altitude, azimuth, and context. No UI change. |
| `get_target_details` | Yes | `target_id` (1–80 chars) and optional `at_time` | Scientific details plus altitude/azimuth at requested or current context. No UI change. |
| `set_observer_location` | No | `latitude`, `longitude`, `location_name` (1–80 chars) | Updated location and prior location. Updates controls, sky, persistence, and planner warning state. |
| `set_observer_time` | No | `iso_time` | Updated and prior time. Pauses playback, updates catalog, sky, inspector, and controls. |
| `frame_target` | No | `target_id`, optional `field_of_view` (0.05–180) | Selected target and framing coordinates. Centers sky, opens inspector, and updates canvas. |
| `preview_observing_plan` | No | `title`, `audience` (`child`, `beginner`, `general`, `experienced`), `duration_minutes` (10–180), `target_ids` (1–12 unique IDs), `category_requirements` with exact `planet`, `bright_star`, and `deep_sky` counts, `min_altitude` (0–90), optional `start_time`, optional proposed `observer` object, optional `notes` (max 500 chars) | Preview ID, context, constraint result, and itinerary. Opens the rail in preview state without changing observer location/time. |
| `save_observing_plan` | No | `preview_id` (1–100 chars) | Saved plan ID and summary. Persists and changes the preview rail to saved state without changing observer location/time. |
| `advance_observing_tour` | No | `direction` (`start`, `next`, `previous`) or `target_index` (0–11), but not both | New progress, selected target, scheduled time, and current altitude. Updates time, framing, inspector, and rail; rejects location mismatch. |
| `configure_sky_layers` | No | One or more optional booleans for `stars`, `objects`, `constellations`, `grid`, `labels`, plus optional `survey` enum | Updated layers and prior layers. Updates switches, survey control, and sky immediately. |

Read-only tools set `annotations: { readOnlyHint: true }`. All tool output is authored from local catalog and state, so `untrustedContentHint` remains false. The seven state-changing tools omit `readOnlyHint` or set it to false explicitly in the test fixtures.

## Validation and errors

Domain validation uses an `AppError` carrying a stable code and safe details. Expected codes include:

- `INVALID_INPUT`
- `TARGET_NOT_FOUND`
- `NO_OBSERVABLE_TARGETS`
- `PLAN_CONSTRAINT_FAILED`
- `PLAN_PREVIEW_NOT_FOUND`
- `PLAN_NOT_SAVED`
- `LOCATION_MISMATCH`
- `TOUR_BOUNDARY`
- `PERSISTENCE_UNAVAILABLE`

Invalid tool inputs do not partially mutate state. When persistence is unavailable, the plan remains usable for the current page and the result clearly says it was not stored. WebMCP registration failure logs one scoped warning and leaves the human interface intact.

## Testing strategy

Node's built-in test runner remains the only test dependency.

Automated tests will cover:

- category classification and dynamic Solar System catalog construction;
- observable-target filtering by category, magnitude, time, location, and altitude;
- slot allocation and start/mid/end altitude validation;
- exact category quotas, duplicate IDs, unknown IDs, invalid dates, ranges, and plan sizes;
- versioned plan save/load, malformed JSON, unavailable storage, and progress restoration;
- each shared action's result and state transition;
- action atomicity on validation failure;
- each tool name, title, description, schema, annotation, handler result, and invalid input path;
- guarded WebMCP absence and mock `registerTool` integration;
- existing astronomy and catalog tests without regression.

Browser verification will cover:

- normal UI with WebMCP absent;
- manual create/add/reorder/save/reload/start/advance flow;
- preview visibility without location or time mutation;
- desktop and mobile planner layouts, keyboard focus, live-region feedback, and reduced motion;
- real tool discovery and calls in the ChatGPT desktop built-in browser using GPT-5.6 Sol or Terra;
- the exact child/New York/30-minute/three-category/minimum-25° prompt;
- invalid target, invalid time, stale preview, tour boundary, and location mismatch errors.

The package scripts will expose `test` and a no-build static verification command. If no linter is added, documentation must state that the project has no lint step rather than claiming one ran.

## Submission artifacts

The implementation includes local-only submission preparation:

- README usage, WebMCP availability, tool table, architecture, testing, and a prominent baseline-versus-extension section;
- `docs/submission/devpost.md` with title, tagline, description, technologies, challenges, accomplishments, lessons, future work, and judging-criteria mapping;
- `docs/submission/demo.md` with a sub-three-minute storyboard, narration, exact prompts, shot list, captions, and screenshot plan;
- `docs/submission/checklist.md` with manual ChatGPT validation, repository/license checks, live URL checks, YouTube and Devpost user-owned steps, and the post-deadline freeze warning;
- an attribution and license audit covering code, Google Fonts, catalog sources, remote surveys, object imagery, and Three.js/jsDelivr.

No external publishing occurs as part of implementation.

## Non-goals

- Generative AI inside the website or any OpenAI API integration.
- Cloud synchronization, accounts, collaboration between multiple people, or a backend database.
- Weather, light-pollution, moon-phase scoring, telescope control, or route optimization beyond the requested altitude/category constraints.
- Rebuilding the WebXR experience around observing plans during this hackathon extension.
- Replacing the canvas renderer, catalog, visual identity, or static deployment model.
