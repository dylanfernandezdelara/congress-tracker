# Congress Tracker

Cloudflare-native Senate vote intelligence app with two runtime surfaces:
- `workers/senate_data_worker/wrangler.toml` — unified worker (API + pipeline + cron + queue)
- `web/` — Vite + React frontend

## Commands

### Install
- Worker deps: `npm --prefix workers/senate_data_worker install`
- Web deps: `npm --prefix web install`

### Local setup
- Copy `workers/senate_data_worker/.dev.vars.example` to `workers/senate_data_worker/.dev.vars`, or run `./scripts/cursor-cloud-setup.sh` (copies the example when missing). The example sets `ALLOWED_ORIGIN=*` so the Vite app at `:5173` can call the worker at `:8787`; `harness:ci`, `./scripts/dev-all.sh`, and `harness:browser` all read `.dev.vars` for CORS. Use a specific origin in production deploy secrets, not in the committed example.
- `CONGRESS_API_KEY` and `GOVINFO_API_KEY` are required only for **live ingestion** against Congress.gov/GovInfo; placeholder values from the example file are enough for deterministic harness runs. For `./scripts/dev-all.sh` without live keys, set `DATA_SOURCE=replay` in `.dev.vars`.
- Optional local synthesis: `SYNTHESIS=on|off` (off by default). When on, set `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and optionally `OPENROUTER_APP_REFERER`, `OPENROUTER_APP_TITLE`. Quality/evidence thresholds (`QUALITY_*`, `EVIDENCE_*`, `ACTIVITY_LOOKBACK_DAYS`, `DATA_FRESHNESS_MAX_HOURS`) have code defaults and are overridable via env when tuning.
- Deterministic harness runs do not require live upstream secrets; they boot workers with `DATA_SOURCE=replay`, `REPLAY_FIXTURE_SET=canonical`, and a fixed `CLOCK`.
- Local D1 bindings are already configured in the Wrangler config; do not change remote resource IDs just to make local development work.

### Local development
- Full stack: `./scripts/dev-all.sh` (or `npm run dev` from the repo root)
- Worker only: `npm --prefix workers/senate_data_worker run dev`
- Web only: `npm --prefix web run dev`
- UI/design review against replay data: start the worker with `DATA_SOURCE=replay` (as in `npm run harness:ci` / `harness:quick`), then run Vite with `VITE_API_URL=http://127.0.0.1:8787 npm --prefix web run dev` (or match the harness API port from `scripts/harness-env.sh`).

### Data refresh
- Trigger local ingestion: `curl -fsS http://127.0.0.1:8787/__pipeline/run/ingestion`
- Trigger deployed ingestion (requires `.env.remote` with `DEPLOYED_PIPELINE_URL` and `PIPELINE_ADMIN_TOKEN`): `npm run refresh:remote`
- Seed historical backfill: `./scripts/backfill-history.sh`

### Verification
- Fast inner-loop harness (worker + HTTP assertions, ~30s, no browser): `npm run harness:quick`
- Full deterministic harness: `npm run harness:ci` (worker + Vite + Playwright; use for final end-to-end checks)
- Harness browser checks only: `npm run harness:browser`
- Worker typecheck: `npm --prefix workers/senate_data_worker run check`
- Worker tests: `npm --prefix workers/senate_data_worker test`
- Worker scheduled smoke test: `npm --prefix workers/senate_data_worker run smoke:scheduled`
- Web tests: `npm --prefix web test`
- Web build: `npm --prefix web run build`

### UI and design review
- There is no separate frontend fixture path. Run the real worker in replay mode (`DATA_SOURCE=replay`, `REPLAY_FIXTURE_SET=canonical`, optional `CLOCK`) and point the web app at it with `VITE_API_URL` (the deterministic harness does this automatically).
- Replay-backed preview deploys use `[env.preview]` in `workers/senate_data_worker/wrangler.toml` (`wrangler deploy --env preview`).

## Key Rules
- Prefer the commands above over guessing root-level npm scripts.
- Default to `npm run harness:ci` for end-to-end verification; only fall back to manual endpoint checks when debugging the harness itself.
- When changing ingestion, read both worker pipeline code and read-model/API surfaces.
- For data freshness issues, check both `/briefings/latest.json` and pipeline status before changing code.
- Use the local pipeline endpoint to repopulate the latest briefing/feed data after pipeline changes.
- Prefer fixtures, cached artifacts, and existing tests over repeated live pulls from Congress.gov or GovInfo during development.
- Never commit secrets from `.dev.vars` or local Wrangler state.
- Commit and push directly to `main` when explicitly requested and validation is green; create a feature branch and PR when explicitly requested.

## Verification By Change Type
- Ingestion, pipeline, or materialization changes: run `npm run harness:ci`. Run `npm --prefix workers/senate_data_worker run smoke:scheduled` only when you also need the non-deterministic live-source smoke path.
- API or read-model changes: run `npm run harness:ci`, then inspect `target/harness/assertions/` if the deterministic API assertions fail.
- Frontend changes: run `npm run harness:quick` for fast API-backed checks; run `npm run harness:ci` before merge. For manual UI review, use replay mode plus `VITE_API_URL` (see **UI and design review** above).

## Freshness And Debugging
- Deterministic harness artifacts, including Playwright failure assets, land in `target/harness/`.
- The canonical replay fixture corpus lives behind `REPLAY_FIXTURE_SET=canonical`; refresh it with `npm --prefix workers/senate_data_worker run fixtures:harness:refresh` when intentionally re-basing the deterministic story.
- Worker health endpoint: `http://127.0.0.1:8787/health`.
- Pipeline status endpoint: `http://127.0.0.1:8787/__pipeline/status`.
- Local ingestion trigger: `curl -fsS http://127.0.0.1:8787/__pipeline/run/ingestion`.
- Useful direct pipeline routes: `http://127.0.0.1:8787/__pipeline/run/ingestion`, `http://127.0.0.1:8787/__pipeline/run/materialize`, and `http://127.0.0.1:8787/cdn-cgi/handler/scheduled`.
- Latest homepage feed source: `http://127.0.0.1:8787/briefings/latest.json`.
- Scheduled (cron) ingestion is not triggered automatically in local development; do not assume cron has run.
- If the homepage looks stale, verify pipeline status first, then trigger ingestion/materialization, then re-check `/briefings/latest.json` before changing ranking or frontend code.

## Project Structure
- `workers/senate_data_worker/src/worker.ts` — single Worker entry: `fetch` + `scheduled` + `queue` handlers
- `workers/senate_data_worker/src/ingest.ts` — vote ingestion and target-date selection
- `workers/senate_data_worker/src/congress/` — Congress.gov client modules (bill-key, bills, committees, members, record)
- `workers/senate_data_worker/src/member-ingest/` — member activity ingestion and summary helpers
- `workers/senate_data_worker/src/contract.ts` — shared API payload types (imported by web via `@contract`)
- `workers/senate_data_worker/src/pipeline/scheduled-ingestion.ts` — pipeline orchestration and scheduled handler
- `workers/senate_data_worker/src/pipeline/ingestion-stages.ts` — explicit ingestion stage functions
- `workers/senate_data_worker/src/pipeline/jobs.ts` — queue processing and historical backfill
- `workers/senate_data_worker/src/pipeline/materialize.ts` — evidence harvest, synthesis, read-model publish
- `workers/senate_data_worker/src/pipeline/logging.ts` — pipeline run IDs, timing, coverage logging
- `workers/senate_data_worker/src/http/router.ts` — HTTP router (public reads + `/__pipeline/*` admin)
- `workers/senate_data_worker/src/read-model.ts` — briefing/detail materialization builders
- `workers/senate_data_worker/src/storage/` — document key helpers and D1 read repositories (health, pipeline status)
- `workers/senate_data_worker/src/synthesis/` — OpenRouter client, prompts, coercers, quality gates
- `workers/senate_data_worker/src/sources/` — shared HTTP/XML/Congress.gov clients
- `workers/senate_data_worker/src/d1/` — D1 schema (`schema.ts` / `PLATFORM_SCHEMA_SQL`), `schema-drift.test.ts`, `kv_documents` JSON store (`documents.ts`), and write paths
- `web/src/` — frontend app and API client

## Notes
- Storage is D1-only: normalized tables plus `kv_documents` for pipeline JSON (ledger, activities, bill evidence, caches).
- The public API exposes only `/briefings/latest.json`, `/votes/:c/:s/:n.json`, `/health`, and `/health/data`; `/__pipeline/*` admin routes are token-gated on deploy.
- The latest homepage feed is served from `/briefings/latest.json`.
- One unified worker handles ingestion/materialization and serving; scheduled (cron) ingestion is not triggered automatically in local dev.
- Local stack ports from the repo scripts: Worker `http://127.0.0.1:8787`, Web `http://127.0.0.1:5173`.
- The deterministic harness exercises the real local worker in replay mode (`DATA_SOURCE=replay`); there is no frontend fixture data file.

## Cursor Cloud

Solo-contributor workflow: push fixes directly to `main` (no PRs or `cursor/*` branches) unless the user asks otherwise.

Repo-level agent VMs use `.cursor/environment.json`. On each start, Cursor runs `./scripts/cursor-cloud-setup.sh` (`npm ci` in `workers/senate_data_worker` and `web`, Playwright Chromium, creates `.dev.vars` from `.dev.vars.example` when missing). An optional **terminal** starts `./scripts/dev-all.sh` — see **Local development** above.

- Default end-to-end check: `npm run harness:ci` (see **Verification** under **Commands** for typecheck, unit tests, and build).
- Store real `CONGRESS_API_KEY` / `GOVINFO_API_KEY` in Cursor **Secrets**, not in committed files, when testing live ingestion.
- CI uses Node.js 20 (`.github/workflows/ci.yml`); there is no `.nvmrc` — Node 20+ is sufficient.
