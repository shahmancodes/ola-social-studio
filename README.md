# Ola

Ola turns a free-text brief into an editable Instagram Story or feed carousel. Stories export as one static 1080 × 1920 PNG. Carousels export as 3–9 ordered 1080 × 1350 PNGs with a caption. Posts, articles, presentations, and free-form designs are marked **Coming Soon** for new requests.

Ola is an early-stage, self-hosted application. It includes company workspaces, brand assets, a local SQLite job queue, editable previews, quality review, optional WhatsApp intake, and optional Canva connection. Generated drafts still need human approval before publication. Instagram publishing, analytics, video, multi-frame Stories, and native Story stickers are outside the current scope.

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

A request begins with a free-text brief. If the format is unclear, Ola asks whether to make a Story or carousel. Explicit requests for other formats receive a Coming Soon response and do not queue generation work. A Story uses one of four static treatments: quick tip, announcement, image-led showcase, or conversation prompt. Carousels use a narrative sequence and a separate caption. The workspace shows progress and quality findings; the editor supports text and layout changes before export.

The pipeline can use public sources for fact-sensitive briefs. It reopens cited pages for evidence review where accessible and leaves unresolved claims in **Needs review**. Visual review also examines each rendered carousel slide. The app records run and review events for later quality and cost analysis. Provider usage and output quality vary with model configuration.

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
