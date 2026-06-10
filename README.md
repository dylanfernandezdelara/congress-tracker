# Congress Tracker

Cloudflare-native app that surfaces **recent U.S. Congress bills with official passage roll-call votes**, rewritten into plain English from official CRS summaries.

## Developer quick start

```bash
./scripts/cursor-cloud-setup.sh
cp workers/senate_data_worker/.dev.vars.example workers/senate_data_worker/.dev.vars
# Edit .dev.vars: add CONGRESS_API_KEY and OPENROUTER_API_KEY
```

In separate terminals:

```bash
npm run dev:worker   # http://127.0.0.1:8787
npm run dev:web      # http://127.0.0.1:5173
```

Populate the feed (requires API keys in `.dev.vars`):

```bash
curl -fsS http://127.0.0.1:8787/__pipeline/run/feed
```

Then open `http://127.0.0.1:5173` for the scrollable flip-card feed.

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

Because the app and API share an origin, the production build calls the API with
relative URLs — no `VITE_API_URL` needed. Set `VITE_API_URL` only if you host
the frontend separately.

## Preview deployments

Open a PR (or run `wrangler versions upload`) to get a Cloudflare **preview URL**
that serves the full app without touching production traffic. See
[`docs/PREVIEW_DEPLOYMENTS.md`](docs/PREVIEW_DEPLOYMENTS.md) for setup and safety
notes.

## HTTP API

- `GET /health` — worker liveness
- `GET /feed/latest.json` — recent bills with passage votes and digests
- `GET /__pipeline/run/feed` — trigger ingestion (optional `PIPELINE_ADMIN_TOKEN`)
