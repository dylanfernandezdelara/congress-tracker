# Daily Senate Update

Cloudflare-native Senate vote intelligence app with three runtime surfaces:
- `workers/senate_data_worker/wrangler.toml` — API worker
- `workers/senate_data_worker/wrangler.pipeline.toml` — pipeline worker
- `web/` — Vite + React frontend

## Commands

### Install
- Worker deps: `npm --prefix workers/senate_data_worker install`
- Web deps: `npm --prefix web install`

### Local setup
- Copy `workers/senate_data_worker/.dev.vars.example` to `workers/senate_data_worker/.dev.vars`.
- Required local secrets: `CONGRESS_API_KEY`, `GOVINFO_API_KEY`.
- Optional local synthesis settings: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_APP_REFERER`, `OPENROUTER_APP_TITLE`, `OPENROUTER_SHADOW_MODE`, `OPENROUTER_CANARY_PERCENT`, `OPENROUTER_MAX_NEW_ANALYSES`.
- Local D1 and R2 bindings are already configured in both Wrangler configs; do not change remote resource IDs just to make local development work.

### Local development
- Full stack: `./scripts/dev-all.sh`
- API worker only: `npm --prefix workers/senate_data_worker run dev:api`
- Pipeline worker only: `npm --prefix workers/senate_data_worker run dev:pipeline`
- Web only: `npm --prefix web run dev`

### Data refresh
- Trigger local ingestion: `./scripts/refresh-data.sh`
- Seed historical backfill: `./scripts/backfill-history.sh`

### Verification
- Worker typecheck: `npm --prefix workers/senate_data_worker run check`
- Worker tests: `npm --prefix workers/senate_data_worker test`
- Worker scheduled smoke test: `npm --prefix workers/senate_data_worker run smoke:scheduled`
- Web tests: `npm --prefix web test`
- Web build: `npm --prefix web run build`

## Key Rules
- Prefer the commands above over guessing root-level npm scripts.
- When changing ingestion, read both worker pipeline code and read-model/API surfaces.
- For data freshness issues, check both `/briefings/latest.json` and pipeline status before changing code.
- Use `./scripts/refresh-data.sh` or the local scheduled endpoint to repopulate the latest briefing/feed data after pipeline changes.
- Prefer fixtures, cached artifacts, and existing tests over repeated live pulls from Congress.gov or GovInfo during development.
- Never commit secrets from `.dev.vars` or local Wrangler state.
- Do not commit or push directly to `main`; use a feature branch and open a PR.

## Verification By Change Type
- Ingestion or pipeline changes: run `npm --prefix workers/senate_data_worker run check`, `npm --prefix workers/senate_data_worker test`, and `npm --prefix workers/senate_data_worker run smoke:scheduled` if scheduled flow or cron wiring changed.
- Ingestion or materialization changes: after code changes, run `./scripts/refresh-data.sh` or trigger the local scheduled/admin endpoint, then verify pipeline status and `http://127.0.0.1:8787/briefings/latest.json`.
- API or read-model changes: run worker typecheck and tests, then verify `http://127.0.0.1:8787/briefings/latest.json` and any touched vote/detail endpoints against the local API worker.
- Frontend changes: run `npm --prefix web test` and `npm --prefix web run build`; manually verify the Vite app against the local API when API contracts or feed rendering changed.

## Freshness And Debugging
- Worker health endpoints: `http://127.0.0.1:8787/health` and `http://127.0.0.1:8788/health`.
- Pipeline status endpoint: `http://127.0.0.1:8788/__pipeline/status`.
- Local ingestion trigger: `./scripts/refresh-data.sh`.
- Useful direct pipeline routes: `http://127.0.0.1:8788/__pipeline/run/ingestion`, `http://127.0.0.1:8788/__pipeline/run/materialize`, and `http://127.0.0.1:8788/cdn-cgi/handler/scheduled`.
- Latest homepage feed source: `http://127.0.0.1:8787/briefings/latest.json`.
- Scheduled workers are not triggered automatically in local development; do not assume cron has run.
- If the homepage looks stale, verify pipeline status first, then trigger ingestion/materialization, then re-check `/briefings/latest.json` before changing ranking or frontend code.

## Project Structure
- `workers/senate_data_worker/src/ingest.ts` — vote ingestion and target-date selection
- `workers/senate_data_worker/src/index.ts` — pipeline orchestration, scheduled handler, queue processing
- `workers/senate_data_worker/src/http.ts` — API endpoints
- `workers/senate_data_worker/src/read-model.ts` — briefing/detail materialization
- `workers/senate_data_worker/src/d1.ts` — D1 read/write helpers
- `web/src/` — frontend app and API client

## Notes
- The latest homepage feed is served from `/briefings/latest.json`.
- The pipeline worker is responsible for ingestion/materialization; scheduled workers are not triggered automatically in local dev.
- Local stack ports from the repo scripts: API `http://127.0.0.1:8787`, Pipeline `http://127.0.0.1:8788`, Web `http://127.0.0.1:5173`.
