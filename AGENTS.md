# Congress Tracker

Cloudflare-native app: ingest House + Senate **passage** roll-call votes, join CRS summaries, rewrite to plain English via OpenRouter, serve an action-row feed.

## Runtime surfaces

- `workers/senate_data_worker/wrangler.toml` — Cloudflare Worker (ingestion + API)
- `web/` — Vite + React feed UI

## Commands

### Install and setup

```bash
npm run setup # same as ./scripts/cursor-cloud-setup.sh (Cursor Cloud runs this via .cursor/environment.json)
```

Copy `workers/senate_data_worker/.dev.vars.example` to `.dev.vars` and set `CONGRESS_API_KEY`, `OPENROUTER_API_KEY`, and optionally `OPENROUTER_MODEL`.

`npm run setup` also installs root Playwright tooling used by `npm run qa:web`.

Local ↔ Cursor Cloud parity: [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md). Quick check: `npm run verify:local`. Seed local feed (offline, no keys): `npm run seed`.

### Local development

- Worker: `npm run dev:worker` (`http://127.0.0.1:8787`)
- Web: `npm run dev:web` (`http://127.0.0.1:5173`)
- Seed sample feed (offline, no keys): `npm run seed`
- Trigger live ingestion (needs API keys): `curl -fsS -X POST http://127.0.0.1:8787/__pipeline/run/feed`
- Feed JSON: `http://127.0.0.1:8787/feed/latest.json?limit=50&offset=0` (paginated object; read `items`)

### Verification

```bash
npm test
```

### Cursor Cloud ship checklist (required for `web/` changes)

Viewport QA and thermonuclear review run in **Cursor / Cursor Cloud**, not GitHub Actions. Every agent session should follow this before opening or updating a PR:

1. `npm test`
2. For `web/` changes: `npm run dev:web` (separate terminal) then `npm run qa:web`
3. Run thermonuclear review on the branch diff; fix CRITICAL and WARNING findings; repeat until CLEAR
4. `npm run preview` — paste the Cloudflare Preview URL into **chat for the user** and the PR (do not wait for the user to ask)
5. Include QA results, thermonuclear review outcome, and preview URL in the PR description

Whenever you change the UI (`web/`), always share the preview URL in your reply so the user can click through and review the visual changes. Each `npm run preview` run prints a new version-specific URL; do not reuse an older link unless you confirm it matches the current build.

`qa:web` checks iPhone SE (320px), iPhone 14 (390px), desktop (1280px), and wide desktop (1440px) in both light and dark mode. It verifies the header, theme toggle, feed card, and headline are not clipped, and that the requested theme is active. Override the target URL with `QA_WEB_URL` if Vite uses a non-default port. Screenshots and a JSON summary land in `artifacts/qa-viewports/`.

Agent context lives in this file and `.cursor/rules/` (`pr-viewport-qa.mdc`, `pr-thermonuclear-review.mdc`) so any Cursor session picks up the same workflow without depending on GitHub.

### Production deploys (Cloudflare Workers Builds, not GitHub Actions)

Pushes to `main` should deploy production via Cloudflare Workers Builds
(`wrangler deploy` via the worker package on the production trigger).
PR branches use `wrangler versions upload` for preview URLs only.

One-time or drift fix: `npm run configure:cloudflare-builds` (needs a user API
token with Workers Builds Configuration: Edit). Details:
[`docs/PREVIEW_DEPLOYMENTS.md`](docs/PREVIEW_DEPLOYMENTS.md).

### Preview deployments (browser-openable, no production impact)

The Worker serves the bundled React app (Workers static assets), so one preview
URL shows the whole app. To produce a shareable preview URL:

```bash
npm run preview   # builds web/dist + `wrangler versions upload`; prints a Preview URL
```

- A Cursor Cloud agent runs with `wrangler` + `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` already set. Step 4 of the ship checklist runs
  `npm run preview` and pastes the printed URL — do not wait for the user to ask.
- For a stable per-branch URL: `cd workers/senate_data_worker && npx wrangler versions upload --env preview --preview-alias <name>`.
- Previews never receive production traffic (`versions upload` ≠ `deploy`). Deployed
  previews use the `[env.preview]` D1 database (`congress-tracker-preview`); local
  `wrangler dev` uses `preview_database_id`. Pipeline writes are blocked on preview
  hostnames.
- Full details and safety notes: `docs/PREVIEW_DEPLOYMENTS.md`.

## API

- `GET /health` — liveness plus `data.ingest` scheduled-run freshness (`ok` | `stale` | `failed` | `unknown`)
- `GET /debug/ingest.json` — detailed ingest monitor payload
- `GET /feed/latest.json?limit=&offset=&chamber=House|Senate&q=` — paginated feed (`{ items, total, limit, offset, has_more }`; `total` capped at 50; optional `chamber` filters to bills with a passage vote in that chamber; optional `q` case-insensitive substring search on title, policy area, digest headline, and normalized bill id; **not** a bare array)
- `GET /stats/session.json` — per-chamber passage vote aggregates
- `GET /stats/pulse.json` — close votes, policy heat, this-week activity
- `GET /stats/defectors.json?chamber=House|Senate&limit=5` — party cross-vote rankings (needs `member_votes`)
- `GET /stats/portfolios.json?chamber=House|Senate&limit=5` — disclosure-based portfolio movers
- `POST /__pipeline/run/feed` (cron also runs feed + member-votes daily at 10:00 UTC)
- `POST /__pipeline/run/digest-refresh?bill=HR1234&bills=S.2` — force-rewrite digests for specific bills (admin)
- `POST /__pipeline/run/session-backfill` — full-session vote backfill (admin)
- `POST /__pipeline/run/member-votes` — ingest per-member passage votes (admin; also chained after daily feed cron)
- `POST /__pipeline/run/executive-posts` — Truth Social executive ingest (admin; also hourly cron)
- `POST /__pipeline/run/disclosures` — local-dev sample disclosures only (`ENABLE_SAMPLE_DISCLOSURES=1` and `ALLOWED_ORIGIN=*` in `.dev.vars`; never in production)

**Sidebar data backfill (production):** Daily cron already chains feed then `member-votes`. After
deploy, still run `session-backfill` (then re-run `member-votes` if needed) against the
**production** Worker before expecting full-session left-rail member spotlights. Preview
Workers block admin writes and use a separate empty D1; local offline: `npm run seed`
populates sample sidebar data.

**Daily ingest (production):** Cloudflare cron runs `runFeedWithMemberVotes` (feed then
best-effort `member-votes`) at **10:00 UTC**, and `runExecutivePostsPipeline` hourly (`0 * * * *`)
— see `[triggers]` in `workers/senate_data_worker/wrangler.toml` (`crons = ["0 10 * * *", "0 * * * *"]`).
`wrangler deploy` applies that schedule; use `npm run deploy:triggers` in
`workers/senate_data_worker` only after `wrangler versions upload` previews. The feed pipeline
only upserts **new** passage votes (skips known roll-call keys) and writes digests for bills
that do not yet have one (capped by `DIGEST_MAX_NEW_REWRITES`). Because Congress.gov lists House
votes oldest-first, daily runs scan list pages until the lookback window is reached (~5 list
requests per run for the current session). Ingest success/failure is persisted in D1
(`pipeline_state`) and surfaced on `GET /health` (`data.ingest`) and `GET /debug/ingest.json`;
web ops UI at `/debug`. See `docs/MONITORING.md`. Manual production ingestion is
`POST /__pipeline/run/feed` on the deployed Worker with
`Authorization: Bearer <PIPELINE_ADMIN_TOKEN>`.

Shared stats/feed JSON types live in `shared/stats-api-types.ts` and `shared/feed-api-types.ts`
(imported by worker + web).

## Project structure

- `workers/senate_data_worker/src/pipeline/run-feed.ts` — ingestion orchestrator
- `workers/senate_data_worker/src/sources/` — House/Senate vote + Congress.gov clients
- `workers/senate_data_worker/src/synthesis/` — OpenRouter digest rewrite
- `workers/senate_data_worker/src/storage/feed.ts` — feed read model
- `wrangler.toml` (repo root) — mirrors `workers/senate_data_worker/wrangler.toml` for Cloudflare Workers Builds
- `web/src/components/FeedRow.tsx` — collapsed feed row UI
- `web/src/components/FeedRowDetail.tsx` — expanded feed row detail panel
- `web/src/utils/feedRowLabels.ts` — topic, event line, procedural detection, teaser helpers

## Key rules

- Prefer commands in this file over guessing root-level npm scripts.
- Default to `npm test` for verification.
- Never commit secrets from `.dev.vars`.
- `FEED_MAX_BILLS`, `VOTE_LOOKBACK_DAYS`, `DIGEST_MAX_NEW_REWRITES` are module constants in `src/constants.ts`.
- Always `git fetch origin` before starting work on a fresh session.
- After `web/` work, follow the ship checklist above (tests → `qa:web` → thermonuclear review → preview URL). Never publish a preview URL without attempting QA and review first.
- After any UI change, always give the user the latest preview URL in chat so they can view the result in a browser.
