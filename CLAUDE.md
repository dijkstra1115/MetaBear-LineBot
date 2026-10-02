# CLAUDE.md

Guidance for AI assistants working in this repository. Read this first, then
[docs/PROJECT-MAP.md](docs/PROJECT-MAP.md), which records what is in scope.

## What this repo is

MetaBear: a Taiwanese crypto-trading community's brand website, LINE Official
Account bot with CRM, an interactive order-flow "academy", and video
production. Everything runs on Cloudflare:

| System | Where | Served by |
| --- | --- | --- |
| Public site: home `/`, picture guides `/learn`, academy `/orderflow/` | `public/`, `web/` | Pages project `metabear-site` (built to `pages/dist/`) |
| Lesson narration Range/seek (`/orderflow/motion/audio/*`) | `pages/functions/` → `src/lesson-audio.ts` | Pages Function |
| LINE webhook, CRM admin `/admin`, analyst desk `/desk`, login `/login`, `/api/*`, `/auth/*`, `/content.json`, `/rates/*`, `/health` | `src/`, `migrations/` | Worker `metabear-backend` (`src/backend.ts`) |
| Lesson videos, showreel, promos | `motion/` | Local render only (outputs not in Git) |

User-facing text, docs and most commit history context are in **Traditional
Chinese (zh-Hant, Taiwan)**. Code identifiers and code comments are English.

## Scope rules (important)

- `docs/PROJECT-MAP.md` is the authority for what is maintained, paused or
  archived. Historical docs, archived READMEs, and old "next steps" are records,
  **not** instructions.
- `archive/` is frozen. Do not edit, restore into `public/`, or run its old
  deploy configs. `npm run test:academy` verifies SHA-256 hashes from
  `archive/2026-09-29/manifest.json`, so any byte change there fails tests.
  `.gitattributes` marks `archive/**` and `experiments/liquidity/**` as `-text`
  to keep bytes stable.
- `experiments/liquidity/` is paused. Do not delete it: the FLOW ARENA branch's
  `flow-arena-engine.js` imports its `taker-only-engine.js`.
- Do not revive retired academy content (old 15 lessons, six-part journey, long
  SVG lessons, live workbench). Old URLs only redirect.
- FLOW ARENA gameplay lives on `origin/flow-arena` (not merged). Never overwrite
  `preview.metabear.io` with this branch's preview config; it hosts the arena
  backend there.
- Only deploy (`npm run deploy`, `deploy:staging`, remote migrations) when the
  task explicitly asks for a release.

## Layout

```
src/                 Worker backend (TypeScript)
  index.ts           Full Worker: fetch router, queue consumer, cron (scheduled)
  backend.ts         Production entry: wraps index.ts, only serves backend paths,
                     308-redirects public paths to PUBLIC_BASE_URL
  preview.ts         Assets-only Worker for preview.metabear.io (env.staging)
  webhook.ts         LINE signature check → enqueue to LINE_EVENTS → processLineEvent
  bot.ts             Reply composition for LINE events
  assistant.ts       Routing: direct command → knowledge → rule → OpenAI (choose among candidates)
  knowledge.ts, faq.ts, support.ts, conversations.ts   FAQ KB, human-support cases, 90-day log
  content.ts         Shared guide/lesson content for LINE and /content.json
  automation.ts, bingx.ts   BingX referral/volume verification, VIP invites (crm-sync, vip-delivery)
  campaigns.ts, audience.ts, tags.ts   Marketing pushes
  signals.ts         Analyst signals (desk API, delivery, media)
  admin.ts           /api/* admin endpoints
  auth.ts, native-auth.ts, auth-enrollment.ts, staff.ts, team.ts   Auth & staff
  line-rich-menu.ts  Rich menu install (cron ensures it)
  http.ts            HttpError, json(), readJson(), signatureValid(), authorized(), textField(), choice()
  db.ts              ensureCustomer(), audit(), customerSelect
  types.ts           Shared domain types (Customer, LineEvent, LineMessage…)
migrations/          D1 SQL migrations, numbered 0001_… → 0014_signals.sql
public/              Static site source (and committed build outputs, see below)
  orderflow/         Academy: catalog, generated lesson pages, motion engine
  orderflow/motion/  core.js, kit.js, compositor.js, player.js, boot.js, lessons/<id>.js, audio/<id>.m4a
web/                 Homepage source bundled by esbuild into public/js/
pages/               Pages project root: wrangler.jsonc, functions/
scripts/             Build, deployment-layout, image/asset generators, staging checks
tests/               *.test.ts (backend, tsx) and *.test.mjs (academy, node --test)
data/bingx-faq.json  FAQ seed data (also used by tests)
motion/              tools/ (render/audio), showreel/, academy-promo/, flow-arena/{launch,gameplay,promo}
docs/                Design, deployment and per-lesson plans (zh-Hant)
archive/, experiments/   Frozen / paused, see scope rules
```

## Commands

Requires **Node.js 22+**. Run from the repo root.

```sh
npm ci
cp .dev.vars.example .dev.vars   # only if .dev.vars does not exist; never commit it
npm run types                    # regenerate worker-configuration.d.ts from wrangler.jsonc
npm run db:migrate               # apply migrations to local D1
npm run dev                      # wrangler dev on :8787 (runs build:site first)
```

Verification (run before committing):

```sh
npm run check          # tsc --noEmit (src/, pages/functions/)
npm test               # backend: tsx --test tests/*.test.ts (Miniflare + D1, external APIs stubbed)
npm run test:academy   # node --test tests/*.test.mjs (catalog, motion determinism, archive hashes)
npm run test:all       # both of the above
npm run build:production   # wrangler dry-run of the production Worker
npm run build:pages && npm run check:pages   # when touching the public site / Pages build
```

Site-only preview without the backend: `npm run build:site`, then
`npm run preview:academy` → http://127.0.0.1:8790/index.html and
`/orderflow/courses.html`.

Video tooling (needs Playwright Chromium and ffmpeg with libx264; `FFMPEG=` to
override): `npm run motion:audio -- <id>`, `npm run motion:render -- <id>`
(also `showreel`, `promo`, `promo-tall`), `npm run motion:serve`. Each
`motion/flow-arena/*` project is a separate HyperFrames project with its own
`npm run dev/check/render` and its own CLAUDE.md, which applies inside that
folder.

`scripts/test-openai.ts` calls the real OpenAI API and costs credits; run it
only when asked.

## Build outputs that are committed

`npm run build:site` (also run by `predev`/`prebuild`) regenerates files that
**are tracked in Git**; rebuild and commit them together with their sources:

- `public/js/` from `web/site.js` (esbuild, ESM with splitting; `/orderflow/*` external).
- `public/orderflow/<id>.html` lesson pages from `scripts/build-motion-pages.mjs`
  + `scripts/build-academy.mjs`. Never hand-edit generated lesson pages; change
  the template, the catalog, or `motion/lessons/<id>.js`.

Not committed: `pages/dist/`, `dist/backend/`, `motion/out/`, `.wrangler/`,
`test-output/`.

## Deployment model

- **Pages** (`metabear-site`) auto-builds from `main` with root `pages/` and
  `npm --prefix .. ci && npm --prefix .. run build:pages`. Pushing site changes
  to `main` publishes them. Watch paths are listed in
  `docs/PAGES-WORKER-SPLIT.md`; update them when adding a new site build input.
- **Worker** `metabear-backend` (`env.production` in `wrangler.jsonc`, entry
  `src/backend.ts`) deploys manually with `npm run deploy`. Its assets are only
  the staff/login files in `dist/backend/`.
- `scripts/deployment-layout.mjs` is the single list that keeps three things in
  sync: backend asset files, assets stripped from the Pages export, and Worker
  route paths. When adding an admin/desk/login asset or a backend route, update
  it **and** the `routes` in `wrangler.jsonc`.
- Production D1 is named `metabear-crm-staging` and queues end in `-staging`.
  These are historical names for the production resources; do not "fix" or
  recreate them. Migrations are never applied automatically by deploys.
- Environments: default (local dev, `LINE_DELIVERY_MODE=disabled`,
  `AUTH_MODE=cloudflare`), `production` (`live`, `native` auth), `staging`
  (public-site preview only; no DB, queues or secrets).

## Backend conventions

- **Routing** is plain `if` chains on `url.pathname` in `src/index.ts`; API
  modules expose `xxxApi(request, env)` handlers. No framework.
- **Errors**: throw `new HttpError(status, "<zh-Hant message>")`; the top-level
  handler turns it into `json({ error })`. Unexpected errors are logged as
  structured JSON (`console.error(JSON.stringify({ event, ...}))`) without user
  content and return a generic 500.
- **Input**: parse bodies with `readJson()`/`readBody()` (size-limited), validate
  with `textField()` and `choice()`. Use `json()` for responses (adds
  `no-store`, `nosniff`).
- **DB**: D1 prepared statements with `.bind()` only; never interpolate user
  input into SQL. Record admin-visible changes with `audit()`. Timestamps are ISO
  strings (`now()`); "month" logic uses `Asia/Taipei` (`currentMonth()`).
- **Schema changes**: add a new numbered file in `migrations/` (next is
  `0015_…`). Never edit an applied migration.
- **Async work** goes through Queues. Message bodies carry a `kind`
  discriminator (`crm-sync`, `vip-delivery`, `campaign-delivery`,
  `signal-delivery`, `support-notification`, `line-menu-install`); bare LINE
  events have none. Adding a kind means updating the union types and the
  dispatcher in `index.ts`. The 5-minute cron runs dispatchers and cleanups in
  `scheduled()`.
- **LINE sends** must respect `env.LINE_DELIVERY_MODE !== "live"` guards so dev
  and tests never message real users. The admin "conversation test" only works
  in `development` with delivery `disabled`.
- **Auth**: `AUTH_MODE=native` (production) uses `native-auth.ts` sessions with
  roles `admin`/`analyst`; `cloudflare` uses Cloudflare Access JWTs; local dev
  accepts `Bearer ADMIN_TOKEN`. Use `adminIdentity()` / `staffIdentity()`;
  native-auth mutations go through `checkMutation()` (same Origin, `X-MetaBear-Request: crm`, JSON body).
- **Privacy**: do not send LINE user IDs to OpenAI or log message text;
  `conversations.ts` redacts codes/credentials. The model only *chooses* among
  published knowledge candidates; it never writes answers or changes referral
  or VIP status.
- `Env` comes from the generated `worker-configuration.d.ts`; run
  `npm run types` after changing bindings or vars. Secrets are listed in
  `.dev.vars.example`.

## Academy (orderflow) conventions

- `public/orderflow/academy-catalog.js` is the single source of truth for lesson
  IDs, numbers, titles, prerequisites, kind and status (currently 20 motion
  lessons; some docs still say 19).
- A lesson is `public/orderflow/motion/lessons/<id>.js` exporting `lesson` with
  `draw(ctx, t)`. `draw` must be a **pure function of `t`**: no retained state,
  no `Math.random()`/`Date.now()` (use `hash`, `rnd`, `noise1` from `core.js`).
  `tests/orderflow-motion.test.mjs` samples every 0.1 s in normal and
  reduced-motion modes and checks that scrubbing back reproduces the frame.
- Respect `prefers-reduced-motion`, keep captions as DOM (not burned in), and
  keep numbers consistent with the lesson's `docs/*-LESSON-PLAN.md`.
- CSP is strict (`script-src 'self'`, no inline styles in the player). Do not add
  inline scripts/styles or third-party origins without updating the CSP in
  `scripts/build-pages.mjs` and `src/site-security.ts`.
- After changing the synth, regenerate audio with `npm run motion:audio` and
  bump `audio_v` in `player.js` to bust caches.

See `docs/ACADEMY-HANDOFF.md`, `docs/ACADEMY-MOTION.md`, `docs/SITE-DESIGN.md`.

## Code style

- TypeScript strict, ES2022 modules, Prettier 3 default formatting (2-space
  indent, double quotes, trailing commas). There is no format script; match the
  surrounding file.
- Frontend is vanilla JS ES modules (GSAP and Three.js on the homepage only).
- Keep comments sparse and explain *why*.
- Tests use `node:test` + `node:assert/strict`; backend tests build the Worker
  with esbuild and run it in Miniflare with stubbed `fetch` for LINE, OpenAI and
  BingX. Add or update tests alongside behavior changes.

## Git

- Commit messages: Conventional Commits in English, imperative, explaining the
  user-visible effect (e.g. `fix: serve byte ranges in the academy preview so
  lesson audio can seek`), with a short body when useful.
- `main` drives the Pages production deploy; work on feature branches.
- Never commit `.dev.vars`, `.env`, databases, `quant/.data/`, or render outputs.
