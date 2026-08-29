# Night Sky Atlas — Plan the Sky Together

**Tagline:** A shared, visible observing route for people and their AI agents.

## Description

Planning a short stargazing session asks a beginner to combine an observer's
place and time, target visibility, object types, and a comfortable route. That
is more than a list of astronomy facts: changing the observer or advancing the
clock changes what the person sees. Night Sky Atlas makes that work collaborative
instead of opaque.

A person can explore the planetarium manually, edit an observing plan, and save
it locally. With WebMCP, an agent can query the same live sky context, find
observable catalog targets, and propose a timed route. The agent's proposal
appears in the same planner rail as an **Agent preview**. Previewing does not
change observer location or time, so the person can inspect the route before
approving any mutation. After approval, the agent can visibly set the observer,
save the route, and advance the shared tour target by target.

This is a good fit for WebMCP because visual sky state is the product: the
person and agent need the same map, time, location, selected target, and plan.
The site exposes ten strict, top-level imperative tools that reuse the manual
application actions rather than a parallel automation path. It remains a
zero-build static site with local browser persistence; no account, backend, or
API key is required.

## Technologies

- HTML, CSS, and native ES modules
- Canvas 2D planetarium with local astronomy and observing calculations
- WebMCP through `document.modelContext.registerTool`
- Browser local storage for the observing plan and preferences
- CDS HiPS2FITS survey imagery (DSS2, Pan-STARRS DR1, 2MASS)
- Three.js 0.180 from jsDelivr for the optional WebXR/Meta Quest view

## Challenges we ran into

- Designing tools that share exactly the same state and validation as manual
  controls, without creating a hidden agent-only path.
- Keeping location and time changes visible and reviewable while still making
  the agent route useful.
- Computing and preserving per-slot altitude constraints for a timed route.
- Making a dense planner rail work at desktop and mobile sizes, with usable
  keyboard focus, live progress, and reduced-motion behavior.

## Accomplishments that we're proud of

- A preview-first workflow: `preview_observing_plan` visibly proposes the route
  before an observer mutation.
- Ten narrow, strict-schema WebMCP tools: three read tools and seven visible
  write tools, including `get_sky_context` and `advance_observing_tour`.
- A manual planner that remains useful without an agent, plus a saved guided
  tour that frames targets and advances time.
- Browser verification of the full New York example: Mars, Mirfak, and the
  Pleiades each stayed above 25° throughout their assigned ten-minute slot.

## What we learned

WebMCP is most compelling when it gives an agent a deliberate application
surface while the person can still see and steer every result. Tool descriptions
and schemas clarify what an agent may ask for, but the visible UI is what makes
the collaboration legible. Separating preview from commit made the location
change understandable instead of surprising.

## What's next

- Add weather, darkness, and equipment-aware recommendations with clearly
  labeled data sources.
- Let people compare alternative plans side by side before saving one.
- Export plans as printable or calendar-friendly observing cards.
- Broaden accessibility testing across assistive technology and real devices.

## Judging map

| Criterion | Evidence |
| --- | --- |
| WebMCP Leverage | Ten top-level, strict-schema `document.modelContext` tools reuse real app actions: three read-only queries and seven writes. The demo shows read → find → preview before location/time mutation, then save and tour advancement. |
| Execution | The static atlas works manually and through WebMCP. It has local persistence, an accessible planner rail, responsive mobile behavior, source credits, and 80 passing Node tests. |
| Potential Impact | Beginners and families can turn “what can we see tonight?” into an understandable, altitude-constrained route without surrendering control of their place, time, or plan. |
| Creativity & Ambition | It turns an existing visual planetarium into a shared human-agent planning surface: the agent proposes an itinerary inside the sky interface, and the person reviews the same visible state before committing it. |

## Submission notes

Use the public live URL and repository shown in the README, plus the
under-three-minutes public YouTube demo recorded from the supplied script. The
project distinguishes the pre-existing July 22 baseline commit
`81672ede79762cbf3aadfe23a8dc9eee32013f94` from the August 28 WebMCP
extension. Final submission and publication remain owner actions; see the
[checklist](checklist.md).
