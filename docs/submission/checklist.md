# WebMCP Challenge submission checklist

The official submission deadline is **September 3, 2026 at 1:00 PM PDT**.
This page separates work verified locally from actions only the project owner
can take. The official rules permit multiple submissions only when each is
unique and substantially different.

## Completed local preparation

- [x] WebMCP extension documentation distinguishes the July 22 baseline commit
  `81672ede79762cbf3aadfe23a8dc9eee32013f94` from the August 28 extension.
- [x] README documents the live URL, local setup, WebMCP inventory, manual
  fallback, data sources, WebXR, limitations, contribution guidance, and MIT
  License.
- [x] Local Devpost description, demo script, judging map, and attribution
  audit are prepared in `docs/submission/`.
- [x] Demo script is timed for 0:00–2:50, includes audio narration and the
  preview-before-location-mutation evidence.
- [x] The supplied Node check command is recorded in the README; the final
  local run passes all 81 tests.
- [x] Six genuine deployment screenshots are captured in
  `docs/submission/screenshots/`, including the 390 × 844 mobile planner.

## Owner actions before submitting

- [ ] Confirm eligibility, create/sign in to Devpost, join the WebMCP
  Challenge, and read/accept all required attestations and Official Rules.
- [x] Push the intended commit to the public repository with GitHub
  authentication. Confirm the repository shows the `LICENSE` file and that the
  MIT License is visible/detectable at the top of the repository page.
- [x] Publish and verify the GitHub Pages live URL:
  <https://jesserweigel.github.io/night-sky-atlas/>.
- [x] Open the published URL in a logged-in ChatGPT desktop built-in browser;
  use GPT-5.6 Sol or Terra, enable Site tools, inspect Available site tools,
  and run the final preview-first prompt. The live run exposed all ten tools,
  previewed and saved a three-target route, advanced it to target 2 of 3, and
  restored that progress after reload with no browser errors.
- [ ] Record the final demo with audio using `demo.md`, ensure it is a public
  YouTube video **under three minutes**, and verify it uses no copyrighted
  music or other third-party material without permission.
- [ ] Capture the seventh planned screenshot manually from the desktop app's
  **Available site tools** menu. Upload all seven screenshots and enter the
  prepared title, tagline, description, live URL, public repository URL, and
  public YouTube URL in Devpost.
- [ ] Verify the submitted text explains the WebMCP fit, better user
  experience, shared human-agent work, and implementation; verify all links
  load for a signed-out judge.
- [x] Run `npm run check` one final time and reconcile the README badge/count.
- [ ] Give final publication approval, submit before the deadline, and save a
  receipt/screenshot of the submitted Devpost entry.

## Freeze during judging

- [ ] Keep the submitted repository public, the license visible, and the live
  URL working and accessible for judges during the judging period.
- [ ] Keep the public YouTube demo available and the submitted materials in
  English.
- [ ] Avoid changing the submitted repository/live site/video during judging
  unless an official process permits it; retain the reviewed submission state.

## Source-of-truth links

- [Official rules](https://webmcp.devpost.com/rules)
- [Challenge requirements](https://webmcp.devpost.com/)
- [OpenAI Site tools documentation](https://learn.chatgpt.com/docs/webmcp)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
