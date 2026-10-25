# Ola product videos

Product videos are a separate feature at `/videos`, available from Ola's company navigation. Existing Story/carousel projects keep their existing formats and workers. A product URL and feature description drive automatic browser discovery, screenshot capture, and a screen recording, producing captured evidence and an editable Remotion storyboard. Export produces an H.264 MP4 with an optional beat-synchronized soundtrack at 30 fps in 1920×1080, 1080×1920, or 1080×1080.

## Reference study

Reviewed the supplied RevisionDojo YouTube pages and sampled playback frames in the browser. This is a visual study of selected frames, not a frame-by-frame or audio analysis. The user identified Remotion as their authoring tool; playback alone does not verify the implementation.

| Reference | Length | Observed frames and design | Pipeline implication |
| --- | --- | --- | --- |
| [Interactive textbooks](https://www.youtube.com/watch?v=8h2Vwq6308w) | 57 s | Opening thumbnail: large white headline and tilted colorful concept cards against black. Around 11 s: a full close-up of an alpha-decay visual. Around 28 s: active-recall question and selected answer. | Dark treatment, feature-panel crops, broad view followed by detailed view. Live scientific animation needs footage or component-level animation. |
| [IA, EE & TOK](https://www.youtube.com/watch?v=9jyJSc1Mzss) | 50 s | Around 15 s: centered coursework form, file chip and large cursor. Around 35 s: an analysis checklist and mascot. White space and purple brand accents. | Capture distinct workflow states; keep a single interaction readable; use cursor and camera emphasis. |
| [Spaces](https://www.youtube.com/watch?v=lJnI4syDH7I) | 38 s | Around 11 s: sidebar, welcome document and checklist. Around 26 s: close-up of worked examples and Ask Jojo panel. | Alternate full workspace orientation with a crop of the relevant pane. Explicit steps can select and capture a panel. |
| [Sketch answers on iPad](https://www.youtube.com/watch?v=TKBd5SSCoyU) | 66 s | Sampled scene: large “Graphs.” heading with purple underline and a floating graph card. Around 20 s: minimal “Draw.” type card. Around 46 s: zoom into marked answer and green feedback. | Mix title beats, image cards, split layouts and close-ups. A screenshot cannot reproduce handwriting in progress. |
| [Jojo in messages](https://www.youtube.com/watch?v=4NBZ1_Bj7-o) | 48 s | Around 14 s: “It sends images” over a messaging interface with graph output. Around 34 s: “Plan your revision” and calendar/message panels. | Short benefit headlines, accent words, cropped interfaces and split comparisons. Native messaging needs supplied captures or a separately authorized capture source. |

The reusable grammar is: a short headline, visual orientation, several feature demonstrations, a closer look, and a closing invitation. The implementation provides five scene types (`title`, `showcase`, `focus`, `split`, `cta`), spring entrances, camera zoom, cursor emphasis, animated accent rules, browser cards, light/dark looks, and a progress line. It is an initial reusable interpretation, not an exact reconstruction of the references.

## Run

```bash
npm ci
npx playwright install chromium
npm run dev
```

The development launcher starts the video worker alongside the existing content worker. For an already-running dev instance, restart it or run `npm run worker:video` separately. Production needs the web process, existing worker, and this additional long-running video worker, sharing the same `OLA_DATA_DIR`.

1. Open Product videos in a signed-in company workspace.
2. Enter a product URL and describe the feature to demonstrate. Product name, aspect ratio and color are optional defaults.
3. Ola opens headless Chromium, observes the page and screenshot, chooses one grounded interaction, then re-observes. It captures 2–5 distinct useful states and a WebM browser recording. If the feature requires login, the job pauses and shows a private credential form with the destination origin. Submit a demo account to resume. Advanced JSON capture steps remain an optional override.
4. Review captured screens and warnings. Edit copy, scene type, duration, image, camera focus, zoom, order and canvas format in the live preview.
5. Under Soundtrack, select Find music for this video. Ola searches the live licensed catalog and chooses a suitable track automatically; optionally describe a music direction. The two starter tracks remain available under the manual disclosure. Preview the scored film, adjust the music volume, or remove music to restore the original timing.
6. Save and render. The worker renders an immutable revision; download becomes available when that revision finishes.

Automatic discovery uses the existing AI Gateway/OpenRouter configuration and vision-capable model routing; its calls are tracked against the company and job. Explicit recipes remain deterministic and require no AI key. The feature description becomes the opening headline; discovered capture labels become scene headlines. Edit them before exporting. Recordings and discovered action logs are downloadable under “Discovery, recording & review notes.”

## Capture recipes

See `examples/product-video/`. Each recipe uses the same input schema as the UI/API. Steps execute in order within one fresh browser context. Each step may navigate to a public URL, apply bounded actions and capture either the viewport or a CSS-selected panel. Supported actions: `click`, `fill`, `select`, `press` (Enter/Tab/Escape/arrow keys), `scroll`, and `drag` (coordinates in a 1440×1000 CSS-pixel viewport). There is no model-supplied JavaScript execution, file upload, or reuse of the user’s existing browser session.

```json
{
  "url": "https://example.com/demo",
  "feature": "Find your next idea.",
  "brand": "Example",
  "steps": [
    { "label": "Explore the workspace" },
    {
      "label": "Find exactly what you need",
      "actions": [{ "type": "fill", "selector": "input[type=search]", "value": "design" }],
      "selector": "main"
    }
  ]
}
```

Selectors are site-specific. Duplicate screenshots are skipped and reported. Small element crops and HTTP errors fail visibly. Visible password forms pause capture for credentials. The discovery model can also request login for an email-only flow. Common browser challenges stop capture. The app does not bypass CAPTCHA. The planner can dismiss consent notices through observed controls.

## Architecture and access

- `src/lib/product-video/schema.ts`: bounded input, storyboard and timeline contracts.
- `discovery.ts`: screenshot-plus-DOM planner with observed element IDs, semantic and nonstandard visible controls, re-observation after actions, duplicate capture rejection, and a 24-decision budget. Failed or inaccessible features fail visibly; there is no generic-scroll fallback. `discovery.json` preserves outcomes and a best-effort replay recipe.
- `credentials.ts` / `login.ts`: one-use AES-256-GCM credential handoff outside the video record, 15-minute expiry, restrictive filesystem modes, and direct username/password form automation. Login runs in a separate unrecorded context; credentials never enter AI prompts or action logs. Cookies/local storage transfer in memory to a new recording context; all browser sessions close after the attempt. HTTPS only; the form destination must match the origin shown to the user. Cross-origin requests are blocked while credentials are being submitted. MFA, SSO, magic links, CAPTCHA and session-storage-only authentication are not yet supported.
- `capture.ts` / `network.ts`: isolated Playwright capture through a DNS-validating proxy. The connection is pinned to the validated public IP to prevent DNS rebinding. Local/private/reserved destinations are blocked, including redirects and subresources. Non-read HTTP methods, WebSockets, media loads, service workers and popup pages are blocked during discovery. A same-origin POST exception exists only in the separate login context. This means some otherwise public SPAs will not load or search correctly; those failures require a capture adapter, not relaxed global protections.
- `store.ts`: company-scoped SQLite records, atomic job claims, leases, explicit interrupted-job retry, revision conflict checks and per-company active-job limits.
- `worker.ts` / `src/video-worker-main.ts`: capture and render work outside the request lifecycle. Capture deadline: 8 minutes, with a 24-decision discovery budget. MP4 render deadline: 15 minutes. A heartbeat exposes worker availability in the UI.
- `src/video/`: shared React/Remotion scenes for browser preview and export. Font bytes are bundled; rendering uses saved images rather than reopening a changing external page.
- `render.ts`: local bundle server on an ephemeral IPv4 port; two render workers; standard screenshot capture (shared-memory capture disabled for compatibility); MP4, poster and storyboard manifest output. Before release, an encoded MP4 frame is compared against the independently rendered expected frame and output dimensions/duration are checked.
- `/api/videos`: membership-protected create/list/edit/render/retry/login-resume operations. Asset and MP4 reads check company access; video supports byte ranges. A changed storyboard invalidates the old download until rendered again.

Files live in `.data/product-videos/<id>` and are not committed. Captures include source URL, page title, UTC timestamp, dimensions and SHA-256. Draft and export are private to the company. No publication, external messaging or cloud upload is performed.

## Public-site test harness

```bash
npm run video:demo -- wikipedia --discover --capture-only
npm run video:demo -- excalidraw --discover
npm run video:demo -- photopea --discover --capture-only
# Omit --discover to use the explicit recipe examples.
# --render-only reuses saved captures without exploring again.
npm test -- src/lib/product-video
```

The harness captures real public websites, records browser sessions, writes real MP4 files and probes their metadata. Automatic runs write to `.data/product-video-discovery/`; `--capture-only` skips Remotion export. It leaves screenshots, a storyboard, poster, MP4 and machine-readable reports in `.data/product-video-demos/`. These standalone examples are not automatically added to a company's project history. External UI changes can break selectors; a failed capture is reported, not replaced by synthetic content. Website content remains the source site's material, and demo footage is for evaluation.

## Gaps before broader rollout

- **Discovery coverage:** tested on real public apps, but not guaranteed for arbitrary websites. Cross-origin iframes, deeply nested shadow DOM, custom keyboard-only controls and features requiring server mutations can need adapters. Discovery is bounded and reports gaps instead of inventing a result.
- **Authenticated products:** standard username/password and username-first forms are supported. Interactive MFA/SSO and arbitrary authentication providers are not. Use a demo account: visible account data after login is included in the screenshots, recording and AI observations; general sensitive-data masking is not implemented.
- **Motion inside the UI:** raw browser recordings now preserve interactions. Remotion still animates screenshot states; automatic trimming, selecting and embedding live-action clips into scenes is a separate extension. Recordings currently include the agent’s thinking pauses.
- **Audio:** automatic discovery from Incompetech’s live catalog, contextual/AI-assisted selection, license evidence, audio-derived beat tracking, synchronized cuts and motion accents, volume/fades, embedded credits and AAC export are implemented. This is a single-publisher adapter, not unrestricted web search. Voiceover, subtitles, sound effects and musical downbeat/section recognition remain future work. Reference audio was not audited.
- **Design fidelity:** custom mascots, native phone/tablet frames and bespoke transitions are not reproduced. The editorial treatment supports accent words and word reveals. Scene-level brand name, accent and theme work; existing company font/logo import remains to be added.
- **Deployment:** this runs on a persistent Node host with Chromium, SQLite and local files. Serverless rendering, distributed queueing, cancellation UI, storage quotas/cleanup and render-cost controls need a production deployment pass.
- **Remotion license:** verify the appropriate license before commercial rollout. The [current license](https://www.remotion.dev/license) permits evaluation and has separate company eligibility terms. Adding these packages does not purchase a company license or change the license on Remotion itself.

## Verified results — 25 October 2026

- TypeScript check and production Next.js build passed.
- All 33 product-video tests passed (schema and network boundaries, durable jobs, company access, revision conflicts and recovery).
- Wikipedia, Excalidraw and Photopea each produced a real 21-second, 1920×1080, 30 fps H.264 MP4. Excalidraw captures drawing and connecting shapes; Photopea captures its landing page, public editor and new-project dialog.
- Corrected an IPv4/IPv6 local-server collision and a Chromium shared-memory frame-tiling bug found during actual MP4 inspection. The final exports use standard screenshot capture. Their encoded-frame mean pixel errors were below 0.3% (the rejection threshold is 2.5%).
- An isolated Ola company passed the complete API workflow: create public capture, wait for draft, edit/save, queue square export, download an MP4 byte range. Anonymous file access returned 401; stale edits returned 409; byte ranges returned 206.
- Browser review verified scene selection, live headline changes, saving, portrait selection and export. The portrait MP4 passed dimension and encoded-frame checks at 1080×1920.
- The broad existing regression suite was attempted: sandboxed Chromium launches failed; the unrestricted attempt encountered timeouts in static-design recipe/layout tests while rendering jobs competed for resources and was stopped. No full-suite pass is claimed. Those existing modules were not changed for this feature.

Machine-readable reports and MP4s are in `.data/product-video-demos/`. The isolated UI/API evaluation is in `.data/product-video-review/`; it does not alter ordinary Ola projects.

## Automatic discovery and login verification — 25 October 2026

- Recipe-free Excalidraw: discovered rectangle/arrow tools, drew two connected boxes, captured three states and recorded the session. Rendered those captures into a 21-second 1080p H.264 film; encoded-frame mean error was 0.14%.
- Recipe-free Photopea: entered its editor, found the nonstandard New Project control, set 1200 × 800 dimensions and created the document. Two screenshots and a 36-second recording.
- Recipe-free Wikipedia: searched for Saturn and opened its article, capturing the overview and contents. Two screenshots and a 22-second recording.
- The Internet public login demo: capture paused on login, accepted the demo credentials published by that site, resumed to `/secure`, and recorded the authenticated workspace in a new context. Login was never recorded.
- 41 targeted tests passed, covering live DOM grounding, recovery, missing evidence, login pausing, actual form submission, cross-origin login rejection, encrypted one-use handoff and existing video boundaries. Type checking and the production build passed.

Artifacts and machine-readable traces: `.data/product-video-discovery/`. These tests use isolated/demo data. The initial Photopea run exposed missing nonsemantic controls; discovery was updated and the rerun passed.

The isolated Ola UI also completed URL → login prompt → credential submission → automatic discovery → editable draft. Recording downloads returned byte ranges; anonymous recording access was denied, and the credential handoff file was deleted.

## Soundtracks and beat matching

The starter catalog includes [Carefree](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400037) and [Wallpaper](https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100843), by Kevin MacLeod, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Their first-party attribution and source metadata are retained. Each scored export includes a credit in the closing scene (minimum four seconds), a downloadable credit text, and the music metadata in the storyboard manifest. Public availability is not treated as permission to reuse arbitrary songs. New catalog entries require a verified download source and compatible license.

`music.ts` downloads only from approved HTTPS source hosts, pins a public resolved address, checks redirects, and limits downloads to 25 MB and 60 seconds. Remotion's bundled FFmpeg decodes up to 120 seconds into mono PCM16 WAV. `music-tempo` (MIT, no runtime dependencies) runs the Beatroot algorithm to find beat timestamps. A catalog tempo hint limits octave errors; it does not supply the timestamps. Quiet tracks or weak onset agreement fail visibly.

`rhythm.ts` creates a shared integer-frame timeline for the Player and export. It trims to the first detected beat, snaps cuts to nearby detected beats while respecting 2–10 second scenes, reserves at least four seconds for the closing credit, and anchors subtle accent pulses and focus zooms to beat frames. Editable requested durations are preserved; changing scene lengths or order recalculates synchronization, and removing music restores silent timing. The UI shows effective scene lengths. This tracks beats, not musical bars or downbeats.

`music_queued` → `scoring` runs in the existing video worker with leases and conflict checks. Adding/removing a soundtrack changes the revision and invalidates stale MP4 downloads. Per-video music and analysis files remain company-protected, with range requests supported for audio preview. Volume changes need no re-analysis.

Exports use local downloaded bytes, verify their SHA-256 against the analysed asset, and encode AAC audio. In addition to the existing pixel QA, the renderer decodes the exported audio to check that it is audible, then compares it with the correctly trimmed source. Export fails if the measured offset exceeds 40 ms or normalized correlation falls below 0.8. `render-quality.json` records cut errors, audio alignment, RMS level and video metadata. Zero volume is an intentional mute and skips the audible-source comparison.

```bash
npm run video:music-demo -- .data/product-video-discovery/excalidraw/captures.json carefree
npm run video:music-demo -- .data/product-video-discovery/excalidraw/captures.json wallpaper --analyse-only
```

The harness writes to `.data/product-video-music-demos/<track>/`. Carefree measured 96.014 BPM and Wallpaper 93.004 BPM from the downloaded audio. The Excalidraw scene boundaries were within 16.7 ms and 13.4 ms respectively of detected beats at 30 fps. The synthetic phase-shifted drum test checks beat detection against independently specified beat times; another test detects an injected 20 ms audio shift. All 50 product-video tests, TypeScript checking and the production build passed during this addition.


## Automatic music discovery

The Soundtrack panel now defaults to automatic discovery. `music-discovery.ts` reads the publisher’s live `pieces.json` and checks its attribution template. It filters malformed entries, restricted-license exceptions, unsupported tempo/duration and vocal instrumentation, ranks mood/tempo/instrumentation against the film, then optionally uses the configured workflow model to order a bounded shortlist. AI choices must refer to verified shortlist IDs; unavailable or invalid AI results use metadata ranking. An optional 300-character music direction refines the selection. Selecting Find a different track excludes the current prepared track.

Up to four candidates are attempted. Each must pass download limits, actual beat analysis and storyboard timing validation. No suitable candidate produces a visible failure, not a fabricated beat grid. The selected publisher page is checked again, and the source URL, attribution, license statement, catalog/page hashes, downloaded audio hash, selection reason and rejected candidates are retained. License evidence downloads are company-scoped. The live catalog cache lasts at most one hour and fails closed when required publisher licensing markers change. No music API key is required; AI ranking uses the existing optional provider configuration.

At verification on 25 October 2026 the publisher listed 1,443 tracks; 990 were eligible for the Excalidraw film after metadata and duration filters. Automatic selection chose Groundwork at a measured 101.993 BPM, including a test with no music brief. The resulting 1920×1080 MP4 passed pixel checks and audio correlation (zero measured lag); cuts were within 13.4 ms of detected beats. All 60 product-video tests, TypeScript and the production build passed.

For the new reference review and prioritized implementation plan, see [Closing the RevisionDojo quality gap](./product-video-quality-roadmap.md).

A second live discovery run selected Northern Glade (measured 80.191 BPM) for the Wikipedia demo with a calm, thoughtful electronic brief. Both selections passed audio beat validation; the Excalidraw selection was additionally rendered and tested through the web UI and protected download APIs.


## Director and clean action editing — 25 October 2026

Capture now runs a second isolated browser pass using the discovered interactions. The exploratory recording remains available as evidence; clean takes are recorded separately through Chromium screencast, with bounded duration/frame counts, real action timestamps and focal bounds. Smooth cursor motion, typing and drawing are filmed rather than synthesized as fake UI. Endpoint stills omit the pointer. The same network and sensitive-action restrictions apply. Replay failures are reported and the director can build an honest still-only plan.

`director.ts` reads captured screenshots and clip evidence to generate an editorial story: hook, context, demonstration, text beat, payoff and invitation. Unknown asset IDs, missing clips and trims that discard the observed action are rejected. AI failure uses a clearly labelled evidence-template fallback. `direction.json` preserves the plan and rationale. Automatic action windows trim leading setup and trailing housekeeping. Clip duration is a lower bound for beat-synchronized shots, so a nearby music beat cannot cut off the action.

The editor exposes clip selection, source start/end, playback rate, camera, focus, zoom and accent words. Preview and export share the same Remotion composition and timeline, including last-frame holds. Old classic storyboards remain supported. Source clip hashes are checked before export; action shots receive additional encoded-frame verification. Clip downloads and direction evidence retain company access checks and byte-range support.

Run `npm run video:directed-demo` for the URL-only Excalidraw benchmark. `--capture-only` stops before audio/render; `--reuse` retains captures and re-runs the director; `--render-only` uses the saved plan; `--replay` re-films the previously discovered interactions. Artifacts are in `.data/product-video-directed/excalidraw/`.

The verified seven-shot export is 25.3 seconds, 1920×1080 at 30 fps. It contains two real action clips, Groundwork music, visible attribution, close action views and a split result shot. All 68 targeted tests passed; encoded still/action-frame mean errors were below 0.14%, soundtrack correlation was 0.99994 with zero measured lag, and scene cuts were within 16.7 ms of detected beats. The source was visually inspected through a contact sheet from the actual MP4.
