# Demo package — 0:00–2:50

Record a single clear screen capture with spoken audio. The submitted video must
be **less than three minutes**; this cut ends at 2:50 and leaves ten seconds of
margin. Do not add copyrighted music. Capture at desktop width first, then show
the mobile viewport as specified below.

## Exact prompt

> Build a 30-minute stargazing session for a child in New York tonight. Include one planet, one bright star, and one deep-sky object, keep every target above 25°, and avoid changing my location without showing me the plan first.

## Timed storyboard, shots, captions, and narration

| Time | Shot and caption | Word-for-word narration |
| --- | --- | --- |
| 0:00–0:15 | **Baseline planetarium** at London. Pan the horizon; select an object. Caption: “A visual atlas for a specific place and time.” | “Night Sky Atlas starts as a hands-on planetarium. I can explore the sky for a place and time, select objects, and inspect real survey imagery.” |
| 0:15–0:31 | Open **Plan**; show manual fields and add/reorder targets. Caption: “People can build and edit a route themselves.” | “I can also build a route manually: add targets, set the audience and duration, reorder the session, and save it locally. That manual path stays first-class.” |
| 0:31–0:43 | Open the browser’s **Available site tools** menu. Caption: “10 Site tools: 3 read, 7 write.” | “Now I open this same site in ChatGPT’s built-in browser. The page exposes ten WebMCP Site tools: three read tools and seven write tools, with strict schemas.” |
| 0:43–0:59 | Enter the exact prompt in the assistant. Keep the current site visibly London. Caption: “Ask for a 30-minute New York session — preview first.” | “I ask for a child-friendly New York session: one planet, one bright star, one deep-sky object, all above twenty-five degrees, and I explicitly ask not to change my location before showing the plan.” |
| 0:59–1:17 | Show tool activity/call summaries: `get_sky_context({})`, `find_observable_targets({categories:["planet","bright_star","deep_sky"],min_altitude:25,max_magnitude:2,at_time:"2026-08-29T05:00:00.000Z",limit:12})`. Caption: “Read context, then find viable targets.” | “The agent first reads the current sky context, then searches the real catalog at the requested time and altitude. These read calls do not change the visible atlas.” |
| 1:17–1:39 | Show `preview_observing_plan` with title `A child's New York night sky`, audience `child`, 30 minutes, Mars/Mirfak/Pleiades, one of each category, minimum 25°, start `2026-08-29T05:00:00.000Z`, proposed observer New York City `40.7128, -74.006`. Keep header/inputs visibly London. Caption: “Agent preview — London remains unchanged.” | “Next comes the key safety moment: preview observing plan. The rail clearly says Agent preview, but the active observer is still London. The proposed New York route is visible before location or time changes.” |
| 1:39–1:52 | Pause on the preview cards: Mars 36.2°, Mirfak 41.6°, Pleiades 27.7° minimum. Caption: “Every 10-minute slot stays above 25°.” | “The plan assigns Mars, Mirfak, and the Pleiades ten minutes each. Their verified minimum altitudes are 36.2, 41.6, and 27.7 degrees, so every slot clears the constraint.” |
| 1:52–2:10 | Show post-approval calls: `set_observer_location({latitude:40.7128,longitude:-74.006,location_name:"New York City"})`, `set_observer_time({iso_time:"2026-08-29T05:00:00.000Z"})`, then `save_observing_plan({preview_id:"[returned preview id]"})`. Caption: “Only after review: location, time, save.” | “After I review it, the agent changes the observer to New York, sets the planned time, and saves the exact preview. Each write has a visible effect in the same atlas rather than disappearing into a background integration.” |
| 2:10–2:28 | Start tour, then next target: `advance_observing_tour({direction:"start"})`, `advance_observing_tour({direction:"next"})`. Show Mars then Mirfak and textual progress. Caption: “A shared tour advances the sky and target.” | “The saved plan becomes a guided tour. Starting frames Mars at five o’clock; Next frames Mirfak at five ten. The person sees the target, time, and progress update together.” |
| 2:28–2:40 | Switch to 390 × 844 mobile view, open planner and show scrolling controls. Caption: “Responsive and keyboard-aware.” | “The planner also fits a phone-width screen with no horizontal overflow, reachable controls, and visible progress. It supports keyboard focus, Escape to close, and reduced-motion preferences.” |
| 2:40–2:50 | Return to desktop saved route and Available site tools menu. Caption: “Plan the sky together.” | “Night Sky Atlas makes an AI agent useful without making it invisible: the agent can reason over a real sky, while the person previews, approves, and shares every change. Plan the sky together.” |

## Required call order

1. `get_sky_context({})`
2. `find_observable_targets({categories:["planet","bright_star","deep_sky"],min_altitude:25,max_magnitude:2,at_time:"2026-08-29T05:00:00.000Z",limit:12})`
3. `preview_observing_plan({title:"A child's New York night sky",audience:"child",duration_minutes:30,target_ids:["planet-mars","star-mirfak","m45"],category_requirements:{planet:1,bright_star:1,deep_sky:1},min_altitude:25,start_time:"2026-08-29T05:00:00.000Z",observer:{latitude:40.7128,longitude:-74.006,location_name:"New York City"}})`
4. Inspect the visible **Agent preview** while the atlas still shows London.
5. `set_observer_location({latitude:40.7128,longitude:-74.006,location_name:"New York City"})`
6. `set_observer_time({iso_time:"2026-08-29T05:00:00.000Z"})`
7. `save_observing_plan({preview_id:"[returned preview id]"})`
8. `advance_observing_tour({direction:"start"})`, then `advance_observing_tour({direction:"next"})`

## Fallback cut plan

If live agent output is slow, preserve authenticity by recording the tool calls
and the resulting page in the same browser session, then cut only pauses. Do
not reorder the sequence or imply that preview mutated the location. If Site
tools are unavailable, use a pre-recorded successful ChatGPT built-in-browser
take only for the tool-call segment, label it “Recorded Site-tools run,” and
continue with live manual shots. Do not substitute a mock tool panel.

## Screenshot plan

Capture these stills for Devpost in addition to the video:

1. Baseline planetarium with selected object and time controls.
2. Manual planner edit with target actions.
3. Agent preview showing New York proposal while London remains active.
4. Saved route with scheduled target metadata.
5. Active tour on Mars or Mirfak with textual progress.
6. 390 × 844 mobile planner with visible close control and no overflow.
7. Available site tools menu showing ten tools and the 3-read/7-write split.
