# Ola

Ola turns a free-text brief into an editable Instagram Story or feed carousel. Stories export as one static 1080 × 1920 PNG. Carousels export as 3–9 ordered 1080 × 1350 PNGs with a caption. Posts, articles, presentations, and free-form designs are marked **Coming Soon** for new requests.

Ola is an early-stage, self-hosted application. It includes company workspaces, brand assets, a local SQLite job queue, editable previews, quality review, optional WhatsApp intake, and optional Canva connection. Generated drafts still need human approval before publication. Instagram publishing, analytics, multi-frame Stories, and native Story stickers are outside the current scope. A separate Product videos preview discovers features in a headless browser, captures screenshots and recordings, and exports animated MP4s with optional beat-synchronized music.

## Requirements

- Node.js 24 or newer and npm
- Playwright Chromium for rendering and visual review
- An AI provider: Vercel AI Gateway or OpenRouter

## Local setup

```bash
npm ci
npx playwright install chromium
cp .env.example .env.local
```

Add `AI_GATEWAY_API_KEY` or `OPENROUTER_API_KEY` to `.env.local`. Keep this file private. Create an owner and the first company:

```bash
npm run bootstrap -- owner@example.com 'a-long-unique-password' 'My company'
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in. `npm run dev` starts the Next.js server and background worker together. For production, run `npm run build`, `npm run start`, and `npm run worker` as separate processes with the same environment and persistent `.data/` directory.

Company admins can add brand details and upload assets after signing in. Ola does not ship with a company brand library. Uploaded assets remain in `.data/`, which is ignored by Git. Rights for any external artwork should be confirmed before use.

## How requests work

A request begins with a free-text brief. If the format is unclear, Ola asks whether to make a Story, carousel or poster. Explicit requests for other formats receive a Coming Soon response and do not queue generation work. A Story uses one of four static treatments: quick tip, announcement, image-led showcase, or conversation prompt. Carousels use a narrative sequence and a separate caption. The workspace shows progress and quality findings; the editor supports text and layout changes before export.

The pipeline can use public sources for fact-sensitive briefs. It reopens cited pages for evidence review where accessible and leaves unresolved claims in **Needs review**. Visual review also examines each rendered carousel slide. The app records run and review events for later quality and cost analysis. Provider usage and output quality vary with model configuration.

## Editing with Ola

Completed requests open directly in the editor, where the original brief, creative choices and answers remain in Ola chat. Creation supports format and slide-count choices, audience and tone, and up to four project reference images; references finish uploading before generation is queued. The brief and choices are saved on the current device per company. After a reload, reference files must be reattached before submitting.

The editor keeps Download visible and explains when saving, rendering or a proposed edit temporarily prevents export. Review findings can select the affected page and known component, prepare a fix request in chat, or be dismissed locally for that report. Local dismissals do not change the project’s QA status. Progress uses a compact left rail with step labels on hover or keyboard focus; detailed agent activity is expandable.

Creation shows elapsed seconds, with per-step seconds in the progress tooltips. Timings include queue time, pause while waiting for user answers, and freeze when the initial draft finishes. Saved activity retains that initial duration and timestamps to the second; older projects without sufficient timing evidence leave durations unavailable. Saving, AI edits and review also show live seconds for the current editor operation.

The generated-content side chat proposes copy, typography, layout and component edits against the current draft. You can refine a preview before accepting or discard it. Accepted changes save automatically in the standard content editor; free-form designs use the editor’s Save button. A redesign uses the current draft as reference and runs production and QA again.

WhatsApp uses the same editing engine and project history for completed drafts. Send an edit, then reply **accept changes** to save and review it, **discard changes** to keep the saved draft, or another instruction to refine the preview. **new** starts another request. Edit and export work runs on the background worker; run it alongside the web server. Saved render previews and uploaded project references provide visual context when the configured model supports images.

## Optional integrations

- **WhatsApp:** Configure the `WHATSAPP_*` variables and `PUBLIC_BASE_URL` in `.env.local`, register the webhook, then pair a signed-in account from the Connect WhatsApp page.
- **Canva:** Configure `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, `CANVA_REDIRECT_URI`, and `CANVA_TOKEN_ENCRYPTION_KEY` to enable the Canva connection.

Neither integration is required for local Story and carousel creation.

## Checks

```bash
npm run typecheck
npm test
npm run test:platform
npm run build
```

`npm run test:social-live` runs six provider-backed briefs in temporary companies and leaves contact sheets in a temporary directory. It makes billable external AI calls, so run it only with your own configured provider account and appropriate test content. The automated checks do not replace a human review of clarity, factual accuracy, visual quality, brand fit, and editability.

## Data and security

The app stores users, company details, jobs, assets, project outputs, and share links in `.data/`. Back up that directory in production. Do not commit `.env.local`, `.data/`, exports, or private company assets. The sample configuration contains empty credential placeholders only.

## License

Ola source code is licensed under the [MIT License](LICENSE). Third-party packages retain their own licenses. Company supplied content and assets are not included in this repository or covered by the source license.

## Local Ola Sentinel

Run `npm run dev:compare` and open [Ola Sentinel](http://127.0.0.1:3100).
The separate app compares **Canva Direct**, **AI + Canva**, and **Ola** from one
frozen brief, brand profile, format, and selected image set. It supports static
Stories and 3–9-page carousels. Select the AI + Canva provider/model for each new
comparison; reruns retain that contender's selected model. Ola uses its normal
configured models and existing generation/review pipeline.

Use **Fixture mode** to test the whole interface without provider calls. Fixture
images are explicitly synthetic and are not evidence of Canva or Ola quality.
Live Ola runs use your configured AI provider. The two live Canva contenders stay
blocked until the Canva permission and OAuth setup below is complete; the Ola
contender can still finish independently.

The lab preserves comparison history, original and revised AI + Canva output,
per-contender versions, actual dimensions, timings, prompts, tool actions, and
reported usage. **Rerun Ola** preserves both Canva baselines. **Copy comparison
reference** identifies the exact run and local artifacts to reference in chat.
There is no automatic ranking, feedback-driven tuning, publication, or WhatsApp
messaging. Additional answers requested by Ola are recorded separately from the
shared starting brief and are visible in the execution history.

### Canva setup

Canva's [MCP policy](https://www.canva.dev/docs/apps/mcp/prohibited-use/) restricts
competitive-product use. Confirm this benchmark is permitted with Canva before
setting `COMPARISON_CANVA_PERMITTED=1`. The app does not obtain that permission.
Then enable MCP for your Canva developer app, configure
`COMPARISON_CANVA_CLIENT_ID`, `COMPARISON_CANVA_CLIENT_SECRET`, and a separate
32-byte base64url `COMPARISON_CANVA_TOKEN_KEY` in `.env.local`. Register exactly
`http://127.0.0.1:3100/api/canva/callback` as the OAuth callback, restart the lab,
and select **Connect Canva**. The existing Ola REST connection is not reused.
The same developer app can support both REST and MCP, but the lab uses its own
OAuth redirect, authorization, encrypted tokens, and configuration. Consent is
limited to profile read, design metadata/content read, design content write, and asset read/write.
Profile read is required for MCP initialization; omitting it caused HTTP 500 even
with an otherwise valid token. Reconnect after changing scopes.
Canva bundles asset uploads with modification/deletion permission; the lab only
exposes its allowlisted upload, creation, inspection, editing, and export tools.

The adapter discovers and validates Canva's live tool schemas. Direct generation
uses `create-design` and its polling job for asset-free briefs. Branded inputs use
Canva's advertised `generate-design` brand exception with uploaded image IDs,
then save the first returned candidate using `create-design-from-candidate`.
Candidate selection is deterministic and recorded; outputs retain actual page counts. AI + Canva plans content with the chosen
model, creates a design, inspects exported images, and applies at most one editing
pass. It has a 12-model-turn / 15-active-minute ceiling and no automatic model
fallback. Supported image-reference fields are validated before upload; an
unsupported asset/format contract is reported explicitly. Live schema changes,
plan restrictions, or unsupported operations require adapter updates rather than
silently dropping input. The live Canva flow must be verified with a real Story
and carousel once permission and credentials are available.

### Isolation, recovery, and checks

The launcher binds only to `127.0.0.1:3100`, starts its background worker, and loads
provider settings from the repository's `.env.local`. It reads company details
from Ola's source database in read-only mode and copies explicitly selected
assets. Test data lives in `.data/comparison`; Ola's isolated test database is in
`.data/comparison/ola`. `COMPARISON_DATA_DIR` and `COMPARISON_SOURCE_DATA_DIR` can
override these locations. Normal Ola's `OLA_DATA_DIR` defaults to `.data`.
No ordinary project is edited, and the comparison worker cannot queue or flush
WhatsApp messages. The frozen input supports PNG/JPEG/WebP/SVG and WOFF2/WOFF/TTF/OTF font files,
including provenance and hashes. Logos are uploaded to Canva. Custom font files are archived and imported into the isolated Ola company. Ola's new Story/carousel renderer loads the supplied files and records exact font names and geometry checks; Canva MCP still has no custom-font upload tool. Historical attempts retain their original limitation notes. Font names and typography
instructions remain in the shared brief. Branded Canva generation may return a
single page for a carousel request; the lab flags that mismatch without padding.

Known Canva creation jobs resume by polling after restart. Uncertain creation or
editing outcomes require an explicit new attempt; the lab never automatically
replays a possibly accepted mutation. Canva calls are serialized per account to
respect shared limits, while Ola can run alongside them. Exports are stored
locally; expiring URLs and authorization values are excluded from public logs.
The worker watches imported source files and reloads after code changes; each run
records the fingerprint loaded by that worker. Interrupted remote edits require
explicit retry. Stop the lab with Ctrl-C. Restarting preserves results and saved inputs.

```bash
npm run typecheck:compare
npm run test:compare
npm run build:compare
```

The usual root type check, test suite, platform smoke check, and build also cover
compatibility with the main app. Local browser checks should cover fixture Story
and carousel generation, synchronized slides, zoom, initial/final output, saved
history, and an Ola-only rerun. The lab is a local tool, not a hosted service.


### Ola visual improvement workflow

New Story/carousel outputs use measured brand fonts, explicit palette roles, content-led layouts, contrast/collision checks, and two rendered alternatives before selection. Checklist, process, comparison, and example components are available when the brief permits extra content. Visual repairs are schema-validated element patches; required quoted copy is locked. Render versions and candidate sources remain on disk, and worse revisions are rolled back. Editable SVG downloads embed their font bytes.

In a saved comparison, **Review anonymously** shuffles the three selected attempts and hides their identities until reveal. Preferences, estimated manual corrections, and notes are attached to exact attempt IDs. No automated comparison win rate is produced. **Reusable brand rules** saves explicit, versioned font, composition, spacing, logo, and guidance choices for that company in the comparison workspace. Only future Ola attempts inherit a saved revision; original frozen inputs and Canva baselines stay unchanged. Rules do not modify ordinary Ola company records.

The local before/after report is available at `/api/improvement-report` after running `node .data/comparison/improvements/report.mjs`. The report verifies hashes of the original attempt records and downloaded output bytes. Live provider failures remain visible and are not counted as quality passes.

### Shared semantic component library

The **Structured visual → Component** picker and the canvas **Add component** menu use one 30-component registry in `src/lib/semantic-component-presets.ts`. Alongside the original 19 structures, it includes pie/donut breakdowns, hierarchy pyramids, hub-and-spoke diagrams, conversion funnels, waterfall bridges, two-axis quadrants, set overlap, calendar heatmaps, parallel swimlanes, proportional flows, and TAM/SAM/SOM market sizing. The same registry supplies examples to generation; these sample figures are illustrative, never factual inputs.

Pie charts and pyramids support 3–5 segments or layers. Quadrant points have editable coordinates, radii and colors. Waterfall closing totals are calculated by the editor; flows must balance, funnels must descend, calendar coordinates must be unique, and market scopes must nest. Values and labels stay in the saved component data. The shared renderer feeds editor previews, PNG export, articles, presentations and canvas elements. Main and heading fonts are independently editable using Manrope, Poppins, system sans or serif. Component text and figures are included in QA evidence and bounded repairs; exact-copy briefs suppress extra component copy.


### Posters

Poster is an active content type in Ola and the Ola Sentinel. It produces one 1240 × 1754 A4 portrait digital proof, with editable headline, supporting copy, CTA, logo/artwork and semantic visuals. PNG and font-embedded SVG rendering use the measured scene pipeline. These files do not include print bleed, CMYK or a print PDF. Canva uses its native poster preset; differences in dimensions and page count are shown without resizing the saved output.

Open `http://127.0.0.1:3100/api/poster-report` for the five-company poster batch. Each row links to its saved three-contender comparison and rerun/version controls. Brand inputs and assets are copied from existing comparison snapshots, preserving the earlier baselines.

### Composition planning and controlled before/after tests

New Poster, Story and Carousel generations draft and validate copy before planning two compositions. Six composition families share the measured renderer. Optional version-1 composition metadata stores stable references to canonical copy fields (including explicit separator-based segments); legacy artifacts without it keep their original render path. Previews and exports use the same scene, and canvas text targets come from measured bounds. Heading/body fonts can be selected from the company snapshot.

The lab's [composition report](http://127.0.0.1:3100/api/composition-report) compares frozen earlier Ola versions with new attempts and links the unchanged Canva baselines. Its test manifest, assessments, fixture renders and verification results live under `.data/comparison/composition-batch`. With a frozen manifest and the lab worker running, `node scripts/composition-batch.mjs --queue` queues the first Ola attempts; `--rerun CASE_ID` queues an affected case, capped at two further cycles. It verifies asset hashes, provider/model configuration and pins baseline brand rules.

The comparison worker no longer watches source files by default: restart `npm run dev:compare` **between** attempts after pipeline changes. Its loaded source fingerprint is saved with each attempt. `COMPARISON_WORKER_WATCH=1` restores opt-in development watching, which can interrupt generation.

For a failed **local candidate render** with both frozen sources saved, `--resume-render CASE_ID` resumes that same attempt once without a new copy draft, composition plan or contender version. The old failure and source hashes are retained in `local-render-recovery.json`. This recovery never applies to Canva operations. Run `node --import tsx src/comparison/composition-runtime-smoke.ts` to check the actual worker transform as well as the Vitest renderer tests.


### Representation before copy

New Poster, Story, Post, Carousel, Presentation and Article generations first create a versioned `representationPlan`: communication goals, narrative sequence, representation choices, selected asset IDs, evidence references and exact-copy source references. Source references are ranges into the authoritative brief rather than a second editable copy value. The writer realizes this plan before copy review and composition; unsupported assets, evidence, page counts and changed supplied copy are rejected with bounded retries. Structured processes, comparisons and checklists cannot silently become unrelated prose during composition or repair. Legacy artifacts without the metadata remain supported.

Explicit quoted `label/detail pairs: "Label" / "Explanation"; ...` in a brief retain separate canonical item fields. Their source ranges are assigned together, and draft/composed checks reject flattened, swapped, omitted or extra repeated pairs. Deliberately repeated supplied pairs remain independent items. Ambiguous quoted prose is not parsed as a pair list. Recipes are optional in normal composition planning and repair: custom alternatives still need source fidelity, distinct structures, narrative rhythm and measured readiness. Explicit recipe-only evaluation can opt into `requireRecipes` without imposing a preset quota on ordinary generation.

The live validation set is available at [the representation report](http://127.0.0.1:3100/api/representation-report), with saved versions, unchanged Canva baselines, inputs and execution details under `.data/comparison/representation-live`. Run `npx vitest run src/lib/content-representation.test.ts` for source protection, format coverage, planning retries and representation continuity checks.

### Content-responsive compositions and local repairs

New visual generations use a shared responsive layout plan. Poster, Story, Carousel, Post and Presentation renderers use the same content measurement, grouping, native diagrams, image containment and repair actions; the public format availability remains unchanged. Only canvas dimensions, protected logo/progress areas and Story safe areas vary by format. Saved compositions without `responsive` retain their existing path.

`composition.responsive` controls arrangement, group anchoring, focal point, proportional gaps and visual prominence. Related copy flows from measured text bounds, and overflowing content is remeasured within readable size limits. Visual treatments include connected stages, cards, numbering and callouts anchored to points in a contained image. Annotations reuse stable copy IDs and cannot introduce extra labels. Original images and semantic components can coexist in one visual group.

QA findings identify a page, actual group/element IDs, the visible problem and an observable repair objective. Bounded `layoutActions` change spacing, attach copy to a visual or headline, scale groups, align text, move groups or reflow columns. They preserve copy and move labels/connectors together. Every repair is rendered and checked again; unknown targets, cycles, excessive transformations, unsafe geometry and duplicate copy are rejected. The editor exposes responsive controls and annotation points, alongside company fonts and canonical copy.

Run `npx vitest run src/lib/responsive-layout.test.ts` for the format/family matrix, dense copy, references, repairs, bounds and export parity. `node scripts/composition-batch.mjs --responsive-proof` renders the three frozen composition examples into separate files without new model or Canva calls. Inspect them at [the responsive proof report](http://127.0.0.1:3100/api/responsive-report). Proofs are deterministic renderer checks, not new contender versions or live QA passes. Their sources, hashes and geometry evidence live in `.data/comparison/responsive-proofs`.


### Comparison modes and generation costs

The shadcn interface has three modes. **Across companies** runs one prompt and
model through Ola for 2–10 saved companies, using each company’s frozen brand
context, assets, and rule revision. Each company has independent results, costs,
versions, and reruns. **Ola vs Canva** retains Ola, Canva Direct, and AI + Canva.
**Compare models** asks for 2–5 contenders, then lets you choose each model from
GPT-6 Luna, GPT-6.1 Sol, Claude Sonnet 5.5, Claude Opus 5.5 and Gemini 4 Argon.
All selected models use one configured provider and the full Ola pipeline, with
frozen starting inputs and brand rules. Model comparisons pin every job, review
and repair to the selected model; they never fall back to another model. Reruns
retain the contender's model and original brand-rule snapshot.

Every future Ola generation, review, research call and AI edit records durable
usage in `ai_runs` and `ai_calls` in its existing platform database. The lab shows
costs per attempt; ordinary Ola has no new cost UI. Provider-reported charges
are preferred, delayed bills are reconciled by the worker, and estimates retain
the pricing snapshot used at the time. Estimated, partial, pending and unavailable
costs remain distinguishable. Search/tool charges are included when reported;
unknown charges are never presented as zero. Historical attempts without complete
usage show cost unavailable. Fixtures make no provider calls.

Restart the comparison worker between generations after upgrading. Existing saved
comparisons migrate automatically without changing their original records, hashes,
exports or human preferences. The ordinary app's configured model defaults remain
unchanged. No live provider calls are required for the automated tests.

### Company memory and design intent

Company settings → Brand details now stores a versioned brand library alongside logos, font files, artwork, palette and the existing guide. It contains visual/writing rules, locales, terminology and short, attributed examples from websites, public social profiles, guidelines and published content. Updating the guide fetches saved source URLs with redirect, private-network, byte and time guards. Inaccessible content stays explicit; public profile text is not a full social-post archive. Available preview images are stored as `reference` assets and are excluded from output-artwork shortlists.

New project snapshots freeze this library. Generation retrieves up to six relevant captured examples, inspects up to three linked visual previews, and records the memory revision/source IDs in workflow evidence. Brief copy takes precedence; examples guide style rather than authorizing copied wording, current claims or image reuse. Intake uses compact brand context so a long reference corpus cannot hide saved artwork identifiers.

The shared responsive renderer leaves ordinary text, processes, grids and comparisons unboxed by default. Visual cards are an explicit treatment; body/CTA panels require `responsive.surfaces` with a target and purpose. Panels follow measured content rather than a minimum fraction of the canvas. Explicit anchor, arrangement and diagram-direction choices are retained. QA records actual rendered geometry, detects dominant repeated reading structures across decks and flags unrequested containers. Purposeful consistent branding and deliberate cards remain available.

The canvas text toolbar supports bold, italic and underline on a selected text block, independently from its wording. Measurement, live text, PNG/SVG and presentation exports share those styles. Partial-word rich-text spans are not implemented.

`/api/intent-report` on the Ola Sentinel shows six before/after examples across the five company profiles, with both Poster, Story and Carousel represented. All previous attempts are preserved. Scripts and source/artifact manifests live under `scripts/ola-intent-*` and `.data/comparison/intent-study`; company source captures are also inspectable in that report.

### Ola Sentinel: on-demand semantic components

Ola Sentinel is the local comparison workspace at `http://127.0.0.1:3100`
(`npm run dev:compare`). Its [candidate gallery](http://127.0.0.1:3100/components)
is also linked from Assets and each saved Ola output.

After representation and copy drafting, a component gap assessor checks the
existing semantic library. A concrete semantic or geometry gap can invoke a
bounded designer: at most two candidates per artifact and one refinement per
candidate. It emits a strict declarative specification of native text regions,
brand-colored rectangles/circles and connectors. It cannot execute arbitrary
code, fetch assets, or invent visible component labels. Stable references bind
every existing component field exactly once, so text and typography stay editable.

Designed components can choose `textFlow:"grouped"`, or receive a partial `responsive.visual.textFlow` repair, to keep each canonical label/detail stack close using measured heights and a common gap. This adds no boxes or words. Side-by-side fields and separate semantic surfaces retain their independent regions; `"regions"` restores legacy placement.

Measured text regions can use clear space below their declared box before reducing font size. This bounded adjustment preserves each region’s top and width, respects neighbouring regions and shapes, and updates native enclosures and connectors. Render evidence records the actual region growth without rewriting the candidate specification.

Each candidate must render and pass deterministic geometry checks in Poster,
Story, Carousel, Post, Presentation and Article, then pass an independent review
of those rendered previews. Portrait and landscape profiles adapt the same
semantic structure. Only validated candidates can be used by their generation.
Data-bound charts, active-state graphics and bound component images retain their existing renderers so that values or assets cannot be silently dropped. An unresolved design gap stays explicit in QA; it does not silently disappear.

The gallery can also design an alternative from a saved Ola attempt and page.
These background jobs preserve source model/provider settings and original
outputs. Candidate specifications, source context, model actions, unsuccessful
drafts, six-format PNG/SVG previews and review notes persist beneath
`.data/comparison/component-candidates`. Interrupted manual jobs require a new
explicit request. Shortlisting is a human review state for later integration;
it never automatically publishes a candidate into the global library.

The [flagged-example comparison](http://127.0.0.1:3100/api/semantic-designer-report)
retains frozen before references, all new versions, copy/brand hashes, QA and
designer traces under `.data/comparison/semantic-designer-study`.

### Visual craft controls and before/after batch

New visual runs develop three art directions before representation and copy drafting. Each rendered candidate carries its direction ID. Typography controls are stored independently for titles, body copy, CTA, labels and details: line height, tracking, size, text measure, alignment, wrapping, word-boundary line breaks and source-referenced phrase emphasis. Canonical wording is never duplicated or changed by styling. User copy edits discard invalid old ranges while retaining type metrics. The editor exposes leading, tracking, phrase emphasis and line breaks; SVG, PNG and editable presentation text use the shared styling rules.

Optional `responsive.craft` controls select a brand palette surface, content measure, horizontal anchoring, packed/spread distribution and text-column staggering. Legacy compositions retain their earlier defaults. Local repairs can patch typography and craft without rewriting copy or replacing the full composition.

Selection can reject every candidate as below the craft standard. Review includes phone-size sequence views, component detail crops and the supplied brand-reference pixels. Rejected selections enter bounded refinement; a merely valid export is not an aesthetic pass. Explicit comparison votes are frozen as style examples for later runs of the same company and format. Automatic scores never become human preferences.

`node --import tsx scripts/ola-craft-batch.mjs --queue` prepares six fresh runs from the frozen intent-study inputs in `.data/comparison/craft-study/runtime`, preserving the original records and output bytes. Run its worker with that directory as `COMPARISON_DATA_DIR`, its `ola` subdirectory as `OLA_DATA_DIR`, and `OLA_DISABLE_MESSAGING=1`. `--pin-source` is allowed only before work starts; `--answer-known` records benchmark harness defaults separately from frozen briefs, and `--audit` checks baseline hashes, assets, model, dimensions, source version and copy contracts. The batch is provider-backed and billable. The before/after gallery is [Visual craft report](http://127.0.0.1:3100/api/craft-report), with full-size pages, QA evidence and explicit human preferences.

Explicit headline phrase breaks also constrain font fitting, so a requested two-line headline cannot silently become three or four lines. Numbered native processes share a connected marker spine; single-item examples use one full reading lane rather than reserving an empty second column. Optional fine frames and accent rules are geometry controls, without adding visible copy. The craft report keeps failed and intermediate versions, and rejects a preference submitted from a stale displayed version.

### Art-directed asset acquisition

Art direction can commission up to two concrete assets (`assetRequests`: subject, purpose, style and placement; directions link request IDs). Existing matching company artwork is reused. Before representation/copy planning, the downloader searches for missing imagery, downloads actual bytes, reopens source and rights pages, and sends the image plus source evidence to an independent visual/rights review. Only approved images receive project-scoped asset IDs. Unavailable or rejected requests fall back to existing artwork or native geometry; source restrictions such as “No external images” still take priority. Articles currently keep their existing prose/component flow.

Approved images are available to representation, composition, rendering, editing and export. Required credits are bound to image pages and checked again at the shared scene boundary. Requests, approvals, failures, sources, image hashes and selected-page usage persist in project workflow evidence and `asset-acquisition.json`. Project downloads do not enter other projects’ automatic artwork shortlists. They are not style-reference screenshots. `OLA_ASSET_ACQUISITION=disabled` is an operational comparison switch; normal runs enable commissioning automatically when the art director requests it.

`node --import tsx scripts/ola-asset-batch.mjs --queue-before` creates three synthetic asset-enabled cases in a separate `.data/comparison/asset-study/runtime` store. Run the isolated comparison worker first with `OLA_ASSET_ACQUISITION=disabled`; after all baseline renders finish, stop that worker and use `--queue-after`, then run the same worker without the disabled switch. `--answer-known` handles only audience/tone already explicitly supplied in the synthetic brief; `--audit` verifies frozen inputs, baseline records/pixels, model, dimensions, copy and acquired image hashes. Both arms are provider-backed and billable. The [asset comparison](http://127.0.0.1:3100/api/asset-report) preserves both arms, failed versions, provenance and explicit human votes. This small stochastic batch is a qualitative comparison, not a measured win rate.

The representation, copy and composition agents also receive approved image previews and their actual aspect ratios, with output artwork explicitly distinguished from style references. Source inspection extracts real image URLs and creator metadata from fetched pages; a bounded alternate search follows a failed download or review. Copy-fact research delegates image licensing to this acquisition stage instead of blocking on unrelated image-rights citations. Native comparison groups retain their own renderer when the paired-row component contract does not apply.

### Textbox styling

Visual composition agents and local repairs use `typography.<role>.box`; selected text edits use `editorAppearance.text.<id>.box`. Both validate the same strict schema. Controls include rounded or pill corners, solid/dashed/dotted/double borders, palette or hex fill and border colors, independent shades and opacity, and four-sided padding. Positive shade blends toward white; negative shade blends toward black. Lengths use design pixels at a 1080px short edge and scale with the canvas. Text color can be set separately. Plain text remains the default.

Shared optional shapes, arrows and connectors are available in the visual editor’s **Shapes** library. Select two objects and choose **Connect objects** to keep their endpoints attached during edits. The component designer can group existing node IDs inside native shapes and route arrows automatically around text, using the same declarative specification across all six component formats. No additional model stage is required. See [shared design primitives](docs/design-primitives.md) for controls, portability and local verification.

Select text in the visual editor and open **Textbox**. Plain clears the container; Rounded and Pill provide editable starting points. Padding and stroke width participate in Chromium text measurement and responsive layout. Contrast uses the translucent fill composited over the underlying surface, and collision checks include the full styled box. The canvas, PNG and SVG share CSS geometry. Presentation exports retain native editable text with native editable fill/border shapes, including two strokes for double borders. PowerPoint retains the existing Arial fallback, so font rendering can differ from PNG/SVG.

`node --import tsx scripts/ola-textbox-batch.mjs --queue` prepares only two synthetic cases (poster and Story), using frozen public brand assets. Run the isolated worker with `.data/comparison/textbox-study/runtime` as `COMPARISON_DATA_DIR`, its `ola` subdirectory as `OLA_DATA_DIR`, `OLA_DISABLE_MESSAGING=1`, and `OLA_ASSET_ACQUISITION=disabled`. After it finishes, stop the worker and run `--baselines --audit`. `--refine` preserves completed versions and queues the same saved content for a renderer refresh, independent QA and bounded local repair. The before view removes textbox styling from each selected generated artifact and remeasures the same copy and composition; the after view preserves the actual pipeline output. This is a controlled rendering comparison, not an estimate of overall generation quality. See the [textbox comparison](http://127.0.0.1:3100/api/textbox-report).

### Autonomous refinement reliability

Craft repairs are partial updates: changing a rule, surface or measure retains every omitted craft setting. Replanning retains the selected direction ID unless another existing direction is explicitly chosen. Empty, identical and intent-only patches are rejected with corrective feedback. Later refinement passes receive the earlier applied patches and their original findings so they can address a surviving defect. Generation checkpoints retain this repair history across retries. A crafted candidate still requires an explicit visual readiness decision when it is the only alternative that rendered successfully.

`node --import tsx scripts/ola-refinement-study.mjs --proof` renders a local regression contact sheet showing the chosen direction, the former default-reset behavior and the fixed partial repair. It makes no provider calls. Running without flags inspects the saved Mozilla textbox-study baseline. With explicit approval for provider charges, `--run` performs one isolated refinement with the same model, copy, brand and copied assets; it writes before/after sources, repair events, QA, usage and preservation checks to a new directory under `.data/comparison/refinement-study`. The original records and outputs remain unchanged. `--study NAME --company NAME` selects another completed brand-library-only fixture from an isolated study with the same runtime structure. These checks establish repair behavior, not a Canva quality win rate.

### Carousel rhythm and phone readability

Measured typography supports optional `maxLines` per role. The renderer reduces only that field from its preferred size until the line budget fits, retaining exact words and reading minima; impossible limits fail without truncation. Phrase breaks must fit within the chosen budget. A partial repair can use `typography:{title:{maxLines:2}}`; `maxLines:null` releases it, restoring unconstrained typesetting. Saved scenes without a limit and manual freeform object sizes keep their existing behavior.

An explicitly quoted label/detail list flattened into a supporting paragraph can be repaired without unlocking source copy. A single patch may clear that paragraph, supply the exact pairs in canonical semantic item fields, and recompose with `bodyMode:"text"`. Every paragraph word must transfer; rewritten, omitted, extra or duplicated pairs are rejected. Separate whole-paragraph requirements remain protected. This rebuilds the paragraph projections through the normal repair API rather than editing the saved result behind QA.

Agent repairs can use partial `responsive` controls to change arrangement, anchor, focal group, visual weight, diagram direction/treatment, annotation points and explicit surfaces without resubmitting the composition or copy bindings. Omitted settings survive. Choosing an arrangement supersedes earlier reflow actions. `resetLayoutActions:true` clears the targeted page's earlier transformations; restate any reflow or attachment that still belongs in the new layout. Family, recipe, typography, craft and canonical copy remain available.

Native processes can use `responsive.visual.nodes:"dots"` for editable station markers joined by a connected route, without adding numbers or visible copy. `nodes:"none"` removes unnumbered markers; an explicit numbered treatment retains its numbered nodes. Horizontal and vertical routes retain their source order. A full composition repair that omits responsive controls retains the prior measured layout rather than downgrading to legacy geometry. If measured process text cannot fit nested columns at its reading minimum, the renderer can resolve it to a vertical process and records that reflow in layout evidence. A real capacity failure still rejects the render with measured region, font-size and line-count details.

With the versioned reading policy enabled, `checklist` and `processSteps` components in `bodyMode:"text"` use measured native text and geometry when no visual recipe or supplied artwork owns the group. Labels, details, tags, shared headings and footer fields retain their copy bindings. Every field remains independently editable, including equal wording in different component cells. Checklists use action marks by default; `visual.nodes:"none"` removes those marks and their reserved space for neutral label/detail fields, without adding another component type; `nodes:null` restores the default marks. Processes use ordered connected stations, with optional explicit numbering. Narrow horizontal groups reflow from actual font measurements. The existing `spacing` action targeting `visual` changes the separation between native list or related-pair entries, with matching text widths in horizontal flow; label/detail gaps stay close. Omission preserves the original spacing. Explicit comparison/grid segmentation retains its original relationship rather than becoming an action list. Supporting word budgets count repeated visible fields separately, using source identities after composition.

`node --import tsx scripts/ola-render-capacity-proof.mjs --native-lists` compares the saved GitHub closing page's historical image-component output with its current native rendering. It preserves the saved source, fonts, typography, assets and original pixels, and records measured sizes and editable fields. This local proof makes no provider calls and does not change the original paid attempt's failed result.

Sequence review compares the primary rendered reading structure, text alignment and headline hierarchy. A closing CTA, different color, recipe name or boxed treatment does not itself create a new primary structure. The check identifies the pages needing recomposition and permits consistent encodings for related numeric data with the same narrative role. Candidate selection receives these findings before choosing a design.

Social renders also record measured text sizes at a 360px viewing width. Product acceptance floors are 14px for primary headlines, 11px for explanatory body/detail, labels and native numeric values, and 10px for actions. These are checks on the saved source font sizes, independent of enlarged previews. New composition plans automatically enable `responsive.readability:{version:1}` so primary social text cannot shrink below those floors during fitting. Legacy scenes retain their saved sizing until explicitly upgraded through a responsive repair. Credits, branding, posters and presentations have separate roles and viewing contexts. Small primary text blocks automatic readiness even when the visual model gives passing scores; repairs can increase typography or visual scale and reflow existing content. Independent visual findings remain bounded to 30 structured entries; all additional defects still survive as readiness-blocking issues.

Diagram images include measured internal HTML/SVG text sizes, including SVG viewBox transforms and final image containment scale. Internal labels use the same social readability gate as native text, with the diagram image as a valid repair target. Preferred typography size ratios span 0.4–2.0; actual text is still bounded by the measured reading minimum and available geometry. When every candidate fails actual rendering, the next bounded worker retry replans composition from the same approved copy and recorded render failures instead of replaying the cached rejected geometry.

Audience and tone use contextual clarification. Explicit user choices take priority. When either field is missing, the context assessor can use its exact saved brand default after judging that it fits the prompt; it asks when the default conflicts, is absent, or leaves a consequential ambiguity. Audience and tone are assessed independently. Agent decisions are saved as `creative-context` workflow events and are never added as fabricated user answers. Offline fallback remains conservative because it cannot assess semantic compatibility.

`node --import tsx scripts/ola-rhythm-proof.mjs` exercises these controls against the saved GitHub carousel in the semantic-designer study. It renders separate before/after files, checks copy, recipes, assets and historical record/pixel hashes, and saves a contact sheet under `.data/comparison/rhythm-proofs`. It makes no provider calls. The deterministic patch demonstrates the repair interface and measured checks; it is not a fresh autonomous generation or an independent aesthetic score.

Add `--readable-defaults` to exercise the versioned reading floors without changing any saved typography settings. The proof still reflows the closing process and clears obsolete transforms; its report distinguishes those structural changes from the automatic type floor. `scripts/ola-professional-study.mjs --prepare` copies three saved synthetic briefs and public brand assets into a fresh isolated runtime without provider calls. Its separate `--run <directory>` mode requires explicit approval for three paid full-pipeline tests, permits only one launch, records usage and clarification interventions, and audits original input, attempt, image and asset hashes. These are fresh generations of known briefs, not held-out evidence or a Canva comparison.

### Editable textbox presets

Agents can now start from ten palette-aware treatments: `plain`, `soft-highlight`, `outline`, `rounded-callout`, `pill`, `dashed-note`, `dotted-note`, `double-frame`, `accent-callout`, and `dark-callout`. Set `typography.<role>.box.preset`; sparse overrides alongside it change border, fill, shade, opacity, corners or individual padding sides. Typography size, width, alignment, bold, italic and underline remain independent. For example, `{box:{preset:"rounded-callout",borderWidth:3,padding:{left:40}},size:1.1,underline:true}`.

Repairs without a new preset preserve the current treatment and unrelated settings. Selecting a preset starts with its defaults. `fill:"none"` and `borderStyle:"none"` explicitly remove inherited paint; `{box:{}}` clears a container. Existing custom styles remain valid.

The visual editor offers the same ten presets plus Custom, Reset style and Make custom. In the free-form canvas, select a text object and open Textbox in the Typography inspector. All individual controls remain available when a preset is selected. Make custom expands the current defaults into editable values and removes the preset reference without changing the appearance. Font, size, color, alignment, bold, italic, underline, spacing and word-based emphasis retain their existing independent controls. The [interactive preset gallery](http://127.0.0.1:3100/textbox-presets) lets you inspect all ten designs and try the actual textbox controls without changing saved projects.

Generated visual pages open in the freeform canvas. Select an object to drag it, resize using its handles, rotate it, or edit exact coordinates in the properties panel. Double-click text (or press Enter after selecting it) to type. Shift-click selects multiple objects; arrow keys nudge, Shift-arrows move ten pixels, Alt-drag bypasses snapping, and Space-drag pans. The toolbar adds text, shapes and library images; Layers exposes ordering, visibility and locking. Layout presets rearrange generated objects while retaining edited text and user-added objects. Layout changes and object edits participate in the existing undo/redo history.

On the first object edit, `editorAppearance.freeform` stores a validated object document with positions in page pixels and back-to-front array order. Image sources remain in company/project storage. The shared scene renderer uses this document for previews, PNGs and PowerPoint output without automatic reflow or overlap restrictions. Autosave renders the version before marking it saved, and downloads remain disabled while edits are pending. Manual canvas saves stay available as drafts needing review; the explicit Review action runs QA. The original generation recipe remains available for layout changes; Ola targets the freeform objects when that document exists.

The main visual editor’s **Insert** library includes editable semantic components, company images, and project uploads. Components retain structured labels/data/styles in each image object's `component`; selecting a component opens its live settings in the left sidebar without altering geometry. The Insert library is docked in that same sidebar. Component edits autosave when valid, with unfinished invalid data kept locally until corrected. Uploaded images use project-scoped `referenceId` values; neither image bytes nor browser blob URLs are saved in the document. Brand assets are checked for company access and reuse eligibility during rendering. Component and upload objects use the same scene pipeline for canvas, autosave, PNG, and presentation exports.

Posts and carousels include **Show preview**, with mobile/web sample Instagram feeds, caption expansion, and carousel arrows, dots, keyboard navigation, and swipe. Opening captures the current draft (including unsaved changes); page images render on demand through draft-preview and are cached only while the dialog is open. This preview does not publish content.


## Product videos (preview)

Open **Product videos** in the company navigation. Enter a URL and describe the feature: Ola discovers interactions in headless Chromium, captures useful screenshots, and saves a browser recording. If login is needed, it pauses for one-use credentials in a private form. Refine the editable Remotion storyboard, preview it, and optionally add licensed music with beat-matched scene cuts, and export an MP4 in landscape, portrait or square format. Advanced capture recipes remain optional. Discovery uses the configured vision model; standard username/password login is supported, while MFA/SSO and features requiring server mutations remain gaps.

`npm run dev` starts the video worker. Existing dev sessions need a restart or `npm run worker:video` in another terminal. Production also needs that worker alongside the web server. See [the pipeline guide](docs/product-video-pipeline.md) for reference analysis, setup, recipes, public-site demos, architecture and known gaps.

Product-video music discovery now searches Incompetech’s live licensed catalog, automatically matches a track to the film, checks its beat timing and retains license evidence. See [the pipeline guide](docs/product-video-pipeline.md) and [the RevisionDojo quality roadmap](docs/product-video-quality-roadmap.md).

Responsive compositions now check visible copy coverage before selection, including glyph text inside embedded diagrams; SVG descriptions and retained source JSON do not count as rendered copy. With readability enabled and no recipe or supplied image, hub-and-spoke components render native editable headings and paired fields, measured in the saved brand fonts. Branches connect only the shared context to its peers, and shared headline copy retains title typography. Legacy diagram renderers that omit existing fields fail with their missing source paths. A neutral statement can use the existing visualContent example structure; it need not become a hub or task list. Repair schemas expose each page’s source-compatible body modes: grid/sequence/comparison segment literal supporting copy, whereas bodyMode text preserves independent canonical fields. Explicit component replacement with a new text-mode plan can restore neutral grouping while preserving approved copy. Rejected repair patches are retained in workflow diagnostics. A4 visual review uses print viewing-distance legibility; social 360px reading floors remain specific to Story, post and carousel.

Before composition freezes copy, an approved statement with exact assigned neutral pairs can realize a generated headline-only hub as independent `visualContent.kind: example` fields. This conservative projection preserves headline, CTA, every exact label/detail and their order. It leaves relationship-map representations, a distinct central entity, additional copy/data, colors/style, images, designed geometry and already composed pages unchanged, and records the change in workflow history. It adds no model call. Example fields use the measured editable layout with no task marks; horizontal direction puts up to four items beside one another and measured failures can reflow to a readable stack. Page `arrangement: columns` controls copy/visual lanes separately. Source labels retain the existing semantic 72-character budget.

An inset reading-field frame can select `craft.ruleSides` from top/right/bottom/left, making open frames, corner brackets or a single edge from the existing rule. Each selection uses editable native lines and preserves text geometry. Omit it or patch it to null to restore all four inset edges. The top-rule and no-rule modes keep their original behavior; the side list only customizes inset mode.
