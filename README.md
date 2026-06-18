# Congress Tracker

Cloudflare-native app that surfaces **recent U.S. Congress bills with official passage roll-call votes**, rewritten into plain English from official CRS summaries.

## Developer quick start

```bash
npm run setup        # install deps + Playwright, scaffold .dev.vars
npm run seed         # offline: fill local D1 with sample bills (no API keys)
npm run verify:local # optional preflight check
```

In separate terminals:

```bash
npm run dev:worker   # http://127.0.0.1:8787
npm run dev:web      # http://127.0.0.1:5173
```

Then open `http://127.0.0.1:5173` for the scrollable action-row feed — the
seeded sample bills appear immediately, no keys required.

To pull **real** data instead of the sample, add `CONGRESS_API_KEY` and
`OPENROUTER_API_KEY` to `workers/senate_data_worker/.dev.vars`, then run live
ingestion (mirrors the production cron):

```bash
curl -fsS http://127.0.0.1:8787/__pipeline/run/feed
```

Local ↔ Cursor Cloud parity details: [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md).

## Architecture

```text
Cloudflare Worker
  cron + GET /__pipeline/run/feed  -> ingest House/Senate passage votes, CRS summaries, LLM digest
  GET /feed/latest.json              -> paginated feed (digest + votes + raw CRS)
  GET /health                        -> liveness
        |
        v
Vite + React (letterpress UI)
  scrollable action-row feed
```

D1 (`DB`) stores `votes` and `bill_digests`.

## Testing

```bash
npm test
```

## Deployment

The Worker serves both the API and the bundled React app (Workers static
assets), so a single deploy ships everything from one origin:

```bash
cd workers/senate_data_worker
wrangler d1 create congress-tracker   # once; update database_id in wrangler.toml
wrangler secret put CONGRESS_API_KEY
wrangler secret put OPENROUTER_API_KEY
cd ../.. && npm run deploy            # builds web/dist, then deploys the Worker
```

Production cron (`0 10 * * *` in `workers/senate_data_worker/wrangler.toml`) runs the feed
pipeline daily via the Worker's `scheduled` handler. The pipeline only upserts **new** passage
votes and writes digests for bills missing one. GitHub Actions runs a backup ingest at 10:30 UTC
(`.github/workflows/daily-ingest.yml`); add `PIPELINE_ADMIN_TOKEN` to **GitHub Actions secrets**
(same value as `wrangler secret put PIPELINE_ADMIN_TOKEN`). Optionally set a `WORKER_URL`
repository variable if the workers.dev hostname changes.

Because the app and API share an origin, the production build calls the API with
relative URLs — no `VITE_API_URL` needed. Set `VITE_API_URL` only if you host
the frontend separately.

## Preview deployments

Run `npm run preview` to build the app and upload a Cloudflare **preview
version** — it prints a browser-openable URL that serves the full app without
touching production traffic. In Cursor Cloud, just ask the agent for a preview.
See [`docs/PREVIEW_DEPLOYMENTS.md`](docs/PREVIEW_DEPLOYMENTS.md) for details and
safety notes.

## HTTP API

- `GET /health` — worker liveness
- `GET /feed/latest.json` — paginated recent bills with passage votes and digests
  - Query: `limit` (1–50, default 50), `offset` (default 0; clamped to the 50-bill feed window)
  - Response: `{ items, total, limit, offset, has_more }` where `items` is the bill array and `total` is capped at 50
  - **Breaking change:** this endpoint no longer returns a bare JSON array; consumers must read `items`
- `GET /__pipeline/run/feed` — trigger ingestion (optional `PIPELINE_ADMIN_TOKEN`)
