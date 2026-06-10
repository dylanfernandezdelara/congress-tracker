# Congress Tracker

Cloudflare-native app: ingest House + Senate **passage** roll-call votes, join CRS summaries, rewrite to plain English via OpenRouter, serve a flip-card feed.

## Runtime surfaces

- `workers/senate_data_worker/wrangler.toml` — Cloudflare Worker (ingestion + API)
- `web/` — Vite + React feed UI

## Commands

### Install and setup

```bash
./scripts/cursor-cloud-setup.sh
```

Copy `workers/senate_data_worker/.dev.vars.example` to `.dev.vars` and set `CONGRESS_API_KEY`, `OPENROUTER_API_KEY`, and optionally `OPENROUTER_MODEL`.

### Local development

- Worker: `npm run dev:worker` (`http://127.0.0.1:8787`)
- Web: `npm run dev:web` (`http://127.0.0.1:5173`)
- Trigger ingestion: `curl -fsS http://127.0.0.1:8787/__pipeline/run/feed`
- Feed JSON: `http://127.0.0.1:8787/feed/latest.json`

### Verification

```bash
npm test
```

### Preview deployments (browser-openable, no production impact)

The Worker serves the bundled React app (Workers static assets), so one preview
URL shows the whole app. To produce a shareable preview URL:

```bash
npm run preview   # builds web/dist + `wrangler versions upload`; prints a Preview URL
```

- A Cursor Cloud agent runs with `wrangler` + `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` already set, so when the user asks for a preview, just
  run `npm run preview` and paste the printed URL into the chat.
- For a stable per-branch URL: `cd workers/senate_data_worker && npx wrangler versions upload --preview-alias <name>`.
- Previews never receive production traffic (`versions upload` ≠ `deploy`), but
  they reuse production bindings (incl. the D1 database).
- Full details and safety notes: `docs/PREVIEW_DEPLOYMENTS.md`.

## API

- `GET /health`
- `GET /feed/latest.json`
- `GET /__pipeline/run/feed` (cron also runs daily at 10:00 UTC)

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
- When the user wants to see changes in a browser, run `npm run preview` and share the printed Cloudflare Preview URL (it does not touch production).
