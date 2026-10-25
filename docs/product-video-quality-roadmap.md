# Closing the RevisionDojo quality gap

Reviewed again on 25 October 2026 against Ola’s Excalidraw export. This is a review of sampled browser playback frames and visible captions from all five supplied references, plus Ola’s implementation. It is not a frame-accurate motion/audio audit, and the source Remotion projects were not available. Observed appearance does not establish whether an element was recreated, composited or recorded.

## Original assessment before the director implementation

Ola has the capture, job, preview, music and export foundation. Its present output still looks like an animated screenshot presentation: a title, one scene per capture, then an ending. The current scene builder picks layouts by capture index, gives product shots five seconds each, and copies capture labels into headlines. The recorded browser session is downloadable but is not used in the film. More random effects or more scene templates alone will not close the gap.

The references use short ideas, deliberate framing, changing scale, recognizable product interactions and brand-specific visual assets. The next milestone should be a directed product film assembled from evidence, with shots and layers that have different jobs.

## Evidence from the references

| Reference and sampled point | Visible treatment | What Ola needs |
| --- | --- | --- |
| [Interactive textbooks, ~11 s](https://www.youtube.com/watch?v=8h2Vwq6308w&t=11s) | An alpha-decay diagram fills the shot: large particle illustration, equation, number cards and labels. | Feature-specific crops and real moving product content. The screenshot should not always sit inside the same browser-card frame. |
| [Interactive textbooks, ~28 s](https://www.youtube.com/watch?v=8h2Vwq6308w&t=28s) | Selected answer turns green and is surrounded by accent sparkles. | Preserve action → result, with a restrained success accent tied to the observed event. |
| [Spaces](https://www.youtube.com/watch?v=lJnI4syDH7I) | Sampled text beats around 11/22/31 s say “Organise your thoughts”, “Write with Jojo” and “Good ideas grow together”; selected words are purple, with a small colored dot. | Short, purposeful intertitles with word-level styling and a consistent brand vocabulary. Ola’s capture labels are often too literal and its underline treatment repeats. |
| [IA, EE & TOK, ~20 s](https://www.youtube.com/watch?v=9jyJSc1Mzss&t=20s) | An enlarged progress checklist and Jojo mascot occupy the frame; active and completed rows are distinct. | A close, readable view of changing state plus separately reusable brand assets. Retain only enough processing footage to explain what is happening. |
| [Sketch answers, ~26 s](https://www.youtube.com/watch?v=TKBd5SSCoyU&t=26s) | A graph close-up with a prominent stylus over the line being drawn. | Continuous action footage or a controlled replay, plus an independently animated pointer/stylus. A before/after screenshot cannot convey drawing. |
| [Sketch answers, ~46 s](https://www.youtube.com/watch?v=TKBd5SSCoyU&t=46s) | A tightly framed 4/4 feedback panel with green success states. | An outcome shot whose important text is legible and held long enough to understand. |
| [Jojo in messages, ~14 s](https://www.youtube.com/watch?v=4NBZ1_Bj7-o&t=14s) | A messaging interface and graph response are prominent; visible captions explain the action. | Device-appropriate composition and demonstrated output, with optional narration/caption timing. Native messaging requires supplied or separately captured assets. |

## Implementation order

### 1. Add a director between discovery and the storyboard

Generate an evidence-grounded film plan: hook → relevant context → action → payoff → invitation. Each shot should specify its purpose, short headline, focal element, capture or clip, readable hold time, camera path and transition. Only promise features actually captured. Let the planner request missing evidence before rendering.

Replace the index-based title/showcase/focus/split pattern in `src/lib/product-video/schema.ts`. A 30–45 second benchmark might use 8–12 shots, including 1–2 second type beats and longer 3–5 second demonstrations; these are editorial starting points, not a fixed template.

### 2. Turn browser exploration into clean action footage

Discovery can remain slow and exploratory. Run a second, bounded capture pass using the discovered interactions to create a clean take. Record action start/end timestamps, target bounding boxes, cursor coordinates, meaningful result changes and screenshot times on one recording clock. Trim thinking pauses, failed clicks and irrelevant waits. Use short clips for typing, drawing, menus, live visualizations and result reveals; keep screenshots for still holds.

Extend `CaptureAsset` and `DiscoveryEvent`, then add clip assets with source start/end, playback rate, focal bounds and optional freeze frames. `src/video/product-film.tsx` and `render.ts` must render those clips in preview and export. Playwright recordings alone do not solve this: the current files include planning pauses and lack enough timing/geometry to edit confidently.

Use higher-density capture and targeted panel captures before zooming. Rendering a heavily cropped 1440-pixel viewport at 1080p cannot create missing detail. Validate source resolution at the planned zoom. Features that require writes need an explicitly supported demo flow/test account; current read-only discovery blocks most server mutations, so some rich demonstrations cannot be captured yet.

### 3. Compose independent layers and camera movement

Add a bounded layer schema: captured panel, footage, text span, cursor/stylus, highlight, shape, logo and supplied mascot. Keep the underlying product truthful. Use observed DOM bounds to isolate useful panels; don't fabricate UI outcomes or ask a model to invent the interface.

Build a small, intentional motion library: panel reveal, word reveal, cursor move/click, focus push-in, pull-back, result emphasis, shared-element continuation and an occasional device or full-bleed composition. Define anticipation, action and settling phases, rather than starting every spring at the scene boundary. Mix wide orientation, medium action and close outcome views.

Import company fonts, logo, colors and authorized brand assets. The references' mascot, stylus and diagrams are a meaningful part of their identity. Ola cannot obtain those details by styling screenshots alone.

### 4. Edit to the music’s structure

The implemented music discovery chooses from the live Incompetech catalog and checks real beat timestamps. The present synchronization snaps scene cuts to detected beats and adds small accents. It does not identify bars, downbeats, musical sections, builds or endings.

Next add phrase-aware edit points, a useful excerpt selector and energy matching. Let an important action land on an accent, hold results across beats, and finish on a musical resolution. Avoid forcing every visible movement onto every beat. Add a small licensed sound-effects palette for clicks, reveals and confirmations. Optional voiceover needs a separate script, pacing, captions and music ducking. Reference music/sound-effects fidelity was not audited in this review.

### 5. Add visual and narrative review before export

Current encoded-frame and audio-alignment checks prove technical integrity, not editorial quality. Review contact sheets and short rendered segments for:

- A clear benefit in the opening seconds and a visible product payoff.
- No invented capabilities, unexplained state jumps or unrelated page content.
- Legible focal text at the final aspect ratio; no clipped headline or cursor obscuring the target.
- No repeated layout for every shot, dead time, duplicate states or unnecessary camera movement.
- Clean entrances/exits, steady capture quality, readable attribution and usable audio levels.

Have a review pass propose bounded edits to timing, crop, copy and composition, then render again. Compare one carefully directed benchmark film against one specific reference before generalizing the rules.

## Suggested first benchmark: Excalidraw

| Approximate time | Shot purpose | Material |
| --- | --- | --- |
| 0–2 s | “An idea starts here.” | Short type reveal, accent on “idea”. |
| 2–5 s | Orient the viewer | Clean full canvas; move toward the first drawing target. |
| 5–9 s | Show the action | Trimmed real clip of a shape being drawn; pointer follows the action. |
| 9–11 s | “Give it shape.” | Short text beat with the resulting shape retained as a layer. |
| 11–16 s | Show a second capability | Draw another shape and connect it; close framing with enough context. |
| 16–20 s | Show the useful result | Pull back to the actual diagram, then briefly highlight the connection. |
| 20–23 s | Make the benefit explicit | “Make the next step clear.” beside the real result. |
| 23–28 s | Close | Product identity, invitation and legible music attribution. |

The table above was the proposed benchmark. The implemented Excalidraw test now uses seven AI-directed shots over 25.3 seconds, with two real action clips, an intertitle and a separate result shot. See the verification details below.

## Scope delivered in this change

Automatic licensed music discovery, the director stage and clean action clip editing are implemented. The director sees captured evidence, chooses short copy and varied shot purposes, and emits an editable plan. A separate browser replay records action footage; automatic trims remove setup/housekeeping while preserving the main action and result. Word reveals, accent words, close framing, camera controls, intertitles, split result shots and last-frame holds are available.

The Excalidraw benchmark was discovered from its URL and a feature description, then filmed using the automatically discovered interactions. Its 1920×1080, 30 fps export is 25.3 seconds long, using Groundwork selected from the live licensed catalog. Encoded action frames matched expected frames with mean pixel error below 0.14%; measured audio lag was zero and cuts were within 16.7 ms of detected beats. The 68 targeted video tests passed.

Remaining quality work: independent composited product/brand layers and assets, shared-element transitions, phrase/downbeat-aware music editing, sound effects, narration and an automated editorial review/repair loop. Technical pixel/audio checks and a manually inspected contact sheet do not establish reference-level editorial quality. Wider music discovery currently means one live publisher catalog, not unrestricted Internet search or multiple music providers.
