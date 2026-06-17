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

Then open `http://127.0.0.1:5173` for the scrollable flip-card feed — the
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
  GET /feed/latest.json              -> pre-built feed (digest + votes + raw CRS)
  GET /health                        -> liveness
        |
        v
Vite + React (letterpress UI)
  scrollable feed of flip-cards
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

### Auto-deploy on push to `main` (no GitHub Actions)

Use Cloudflare **Workers Builds** to deploy production whenever `main` updates.
One-time setup (GitHub OAuth in dashboard, then build triggers):

See [`docs/PRODUCTION_DEPLOYMENTS.md`](docs/PRODUCTION_DEPLOYMENTS.md).

Quick dashboard path: **Workers & Pages → congress-tracker-api → Settings → Builds → Connect GitHub**, then set build command to `npm ci && npm --prefix workers/senate_data_worker ci && npm --prefix web ci && npm run build:web` and deploy command to `npx wrangler deploy --config workers/senate_data_worker/wrangler.toml`.

Or run `npm run setup:workers-builds` after creating a user-scoped Builds API token.

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
- `GET /feed/latest.json` — recent bills with passage votes and digests
- `GET /__pipeline/run/feed` — trigger ingestion (optional `PIPELINE_ADMIN_TOKEN`)
