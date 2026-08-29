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
- [x] The supplied Node check command is recorded in the README; final run
  output and test count must be confirmed immediately before submission.

## Owner actions before submitting

- [ ] Confirm eligibility, create/sign in to Devpost, join the WebMCP
  Challenge, and read/accept all required attestations and Official Rules.
- [ ] Push the intended commit to the public repository with GitHub
  authentication. Confirm the repository shows the `LICENSE` file and that the
  MIT License is visible/detectable at the top of the repository page.
- [ ] Publish or verify the GitHub Pages live URL:
  <https://jesserweigel.github.io/night-sky-atlas/>. Do not claim publication
  from this local preparation alone.
- [ ] Open the published URL in a logged-in ChatGPT desktop built-in browser;
  use GPT-5.6 Sol or Terra, enable Site tools, inspect Available site tools,
  and run the final preview-first prompt. This has not been performed by this
  documentation task.
- [ ] Record the final demo with audio using `demo.md`, ensure it is a public
  YouTube video **under three minutes**, and verify it uses no copyrighted
  music or other third-party material without permission.
- [ ] Upload the seven planned screenshots and enter the prepared title,
  tagline, description, live URL, public repository URL, and public YouTube
  URL in Devpost.
- [ ] Verify the submitted text explains the WebMCP fit, better user
  experience, shared human-agent work, and implementation; verify all links
  load for a signed-out judge.
- [ ] Run `npm run check` one final time and reconcile the README badge/count
  if necessary.
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
