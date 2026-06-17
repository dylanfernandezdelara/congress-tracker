# Congress Tracker

Cloudflare-native app: ingest House + Senate **passage** roll-call votes, join CRS summaries, rewrite to plain English via OpenRouter, serve a flip-card feed.

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
- Trigger live ingestion (needs API keys): `curl -fsS http://127.0.0.1:8787/__pipeline/run/feed`
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
4. `npm run preview` — paste the Cloudflare Preview URL into chat and the PR (do not wait for the user to ask)
5. Include QA results, thermonuclear review outcome, and preview URL in the PR description

`qa:web` checks iPhone SE (320px), iPhone 14 (390px), desktop (1280px), and wide desktop (1440px) in both light and dark mode. It verifies the header, theme toggle, feed card, and headline are not clipped, and that the requested theme is active. Override the target URL with `QA_WEB_URL` if Vite uses a non-default port. Screenshots and a JSON summary land in `artifacts/qa-viewports/`.

Agent context lives in this file and `.cursor/rules/` (`pr-viewport-qa.mdc`, `pr-thermonuclear-review.mdc`) so any Cursor session picks up the same workflow without depending on GitHub.

### Preview deployments (browser-openable, no production impact)

The Worker serves the bundled React app (Workers static assets), so one preview
URL shows the whole app. To produce a shareable preview URL:

```bash
npm run preview   # builds web/dist + `wrangler versions upload`; prints a Preview URL
```

- A Cursor Cloud agent runs with `wrangler` + `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` already set. Step 4 of the ship checklist runs
  `npm run preview` and pastes the printed URL — do not wait for the user to ask.
- For a stable per-branch URL: `cd workers/senate_data_worker && npx wrangler versions upload --preview-alias <name>`.
- Previews never receive production traffic (`versions upload` ≠ `deploy`), but
  they reuse production bindings (incl. the D1 database).
- Full details and safety notes: `docs/PREVIEW_DEPLOYMENTS.md`.

## API

- `GET /health`
- `GET /feed/latest.json?limit=&offset=` — paginated feed (`{ items, total, limit, offset, has_more }`; `total` capped at 50; **not** a bare array)
- `GET /stats/session.json` — per-chamber passage vote aggregates
- `GET /stats/pulse.json` — close votes, policy heat, this-week activity
- `GET /stats/defectors.json?chamber=House|Senate&limit=5` — party cross-vote rankings (needs `member_votes`)
- `GET /stats/portfolios.json?chamber=House|Senate&limit=5` — disclosure-based portfolio movers
- `GET /__pipeline/run/feed` (cron also runs daily at 10:00 UTC)
- `GET /__pipeline/run/session-backfill` — full-session vote backfill (admin)
- `GET /__pipeline/run/member-votes` — ingest per-member passage votes (admin)
- `GET /__pipeline/run/disclosures` — local-dev sample disclosures only (`ALLOWED_ORIGIN=*` and `ENABLE_SAMPLE_DISCLOSURES=1` in `.dev.vars`; never in production)

**Sidebar data backfill (production/preview):** Cron runs feed only. After deploy, run
`session-backfill` then `member-votes` against the target Worker before expecting left-rail
member spotlights. Local offline: `npm run seed` populates sample sidebar data.

Shared stats JSON types live in `shared/stats-api-types.ts` (imported by worker + web).

## Project structure

- `workers/senate_data_worker/src/pipeline/run-feed.ts` — ingestion orchestrator
- `workers/senate_data_worker/src/sources/` — House/Senate vote + Congress.gov clients
- `workers/senate_data_worker/src/synthesis/` — OpenRouter digest rewrite
- `workers/senate_data_worker/src/storage/feed.ts` — feed read model
- `web/src/components/FlipCard.tsx` — flip-card UI

## Key rules

- Prefer commands in this file over guessing root-level npm scripts.
- Default to `npm test` for verification.
- Never commit secrets from `.dev.vars`.
- `FEED_MAX_BILLS`, `VOTE_LOOKBACK_DAYS`, `DIGEST_MAX_NEW_REWRITES` are module constants in `src/constants.ts`.
- Always `git fetch origin` before starting work on a fresh session.
- After `web/` work, follow the ship checklist above (tests → `qa:web` → thermonuclear review → preview URL). Never publish a preview URL without attempting QA and review first.
