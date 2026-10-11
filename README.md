# Congress Tracker

Cloudflare-native app behind [trackcongress.org](https://trackcongress.org): **recent U.S. Congress bills with their House and Senate passage roll-call votes**, each summarized in plain English from the bill's own text. Independent and unofficial; not a U.S. government website.

## Developer quick start

Local D1 starts empty. **Run `npm run seed` before (or right after) starting the
dev servers** so the feed and House/Senate left rail have sample data — no API
keys required.

```bash
npm run setup        # install deps + Playwright, scaffold .dev.vars
npm run seed         # required for local UI data (feed + left-rail spotlights)
npm run verify:local # optional preflight check
```

In separate terminals:

```bash
npm run dev:worker   # http://127.0.0.1:8787
npm run dev:web      # http://127.0.0.1:5173
```

Then open `http://127.0.0.1:5173` — seeded sample bills and member spotlights
appear immediately. Re-run `npm run seed` anytime the left rail goes empty
(e.g. after a local `members-roster` sync).

To pull **real** data instead of the sample, add `CONGRESS_API_KEY` and
`OPENROUTER_API_KEY` to `workers/senate_data_worker/.dev.vars`, then run live
ingestion (mirrors the production cron):

```bash
curl -fsS -X POST http://127.0.0.1:8787/__pipeline/run/feed
```

Local ↔ Cursor Cloud parity details: [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md).

## Architecture

```text
Cloudflare Worker (API + bundled React app, one origin)
  cron 0 10 * * *   -> ingest passage votes, introductions, laws, confirmations, member votes
  cron 20 * * * *   -> executive posts
  cron 35 * * * *   -> summary sweep: write plain-language summaries from bill text (OpenRouter)
  GET /feed/latest.json, /stats/*, /og/*  -> feed, sidebars, share cards
  GET /health                              -> liveness + ingest freshness
        |
        v
Vite + React feed UI (web/), built on dfdl components
```

D1 (`DB`) stores votes, members, bill summaries and pipeline state. How summaries are written,
checked and budgeted is in [`AGENTS.md`](AGENTS.md) → **Plain-language summaries**.

## Testing

```bash
npm test
```

## Deployment

The Worker serves both the API and the bundled React app (Workers static
assets), so a single deploy ships everything from one origin.

**Automatic:** pushes to `main` deploy production via Cloudflare Workers Builds
(Wrangler + Cloudflare git integration — no GitHub Actions deploy workflow).
See [`docs/PREVIEW_DEPLOYMENTS.md`](docs/PREVIEW_DEPLOYMENTS.md) for build
commands and one-time setup (`npm run configure:cloudflare-builds`).

**Manual** (local or agent):

```bash
cd workers/senate_data_worker
wrangler d1 create congress-tracker   # once; update database_id in wrangler.toml
wrangler secret put CONGRESS_API_KEY
wrangler secret put OPENROUTER_API_KEY
wrangler secret put PIPELINE_ADMIN_TOKEN
wrangler secret put CF_AIG_TOKEN   # AI Gateway "trackcongress" (authenticated), see AGENTS.md
cd ../.. && npm run deploy            # builds web/dist, then deploys the Worker
```

Production crons (`[triggers]` in `workers/senate_data_worker/wrangler.toml`) run the feed
pipeline daily at 10:00 UTC, executive posts hourly at :20 and the summary sweep hourly at :35.
The feed pipeline only upserts **new** passage votes and queues bills without a summary for the
sweep. Ingest health is recorded in D1 and exposed on
`GET /health` (`data.ingest`) and `GET /debug/ingest.json`; see [`docs/MONITORING.md`](docs/MONITORING.md).
The web app has a temporary ops page at `/debug` (not linked in navigation). To manually trigger
production ingestion, POST to `/__pipeline/run/feed` on the deployed Worker with
`Authorization: Bearer <PIPELINE_ADMIN_TOKEN>`.

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

Public, read-only:

- `GET /health` — worker liveness plus `data.ingest` freshness (`ok` | `degraded` | `stale` | `failed` | `unknown`)
- `GET /debug/ingest.json` — detailed ingest monitor payload (same status logic as `/health`; error text is sanitized)
- `GET /feed/latest.json` — paginated recent bills with passage votes and summaries
  (`{ items, total, limit, offset, has_more }`; `limit` 1–50, `offset`, plus optional filters)
- `GET /stats/*.json` — sidebar data (members, recent laws, confirmations, tightness, defectors)
- `GET /og/bill/:bill.png` — 1200×630 share card

Admin (`Authorization: Bearer <PIPELINE_ADMIN_TOKEN>` in production): `POST /__pipeline/run/*`
triggers ingestion, summary refreshes and backfills.

The full endpoint reference, with every query parameter, is in [`AGENTS.md`](AGENTS.md) → **API**.
