# Congress Tracker

Cloudflare-native Senate vote intelligence app with two runtime surfaces:
- `workers/senate_data_worker/wrangler.toml` — unified worker (API + pipeline + cron + queue)
- `web/` — Vite + React frontend

## Commands

### Install and setup
- Run `./scripts/cursor-cloud-setup.sh` (`npm ci` in worker and web, Playwright Chromium, creates `workers/senate_data_worker/.dev.vars` from `.dev.vars.example` when missing).
- Or install manually: `npm --prefix workers/senate_data_worker install`, `npm --prefix web install`, then `npm --prefix web exec -- playwright install --with-deps chromium` (required for `npm test`, `npm run screenshot:replay`, and `npm run snapshot`; see `./scripts/cursor-cloud-setup.sh`).

### Local setup
- Copy `workers/senate_data_worker/.dev.vars.example` to `workers/senate_data_worker/.dev.vars`, or use `./scripts/cursor-cloud-setup.sh`. The example defaults to replay (`DATA_SOURCE=replay`, `REPLAY_FIXTURE_SET=canonical`) and sets `ALLOWED_ORIGIN=*` so the Vite app at `:5173` can call the worker at `:8787`. Use a specific origin in production deploy secrets, not in the committed example.
- `CONGRESS_API_KEY` and `GOVINFO_API_KEY` are required only for **live ingestion** — set real keys and switch `DATA_SOURCE` to `live`.
- Deterministic test runs boot workers with `DATA_SOURCE=replay`, `REPLAY_FIXTURE_SET=canonical`, and a fixed `CLOCK`.
- Local D1 bindings are already configured in the Wrangler config; do not change remote resource IDs just to make local development work.

### Local development
- Worker: `npm run dev:worker` (`http://127.0.0.1:8787`)
- Web: `npm run dev:web` (`http://127.0.0.1:5173`)
- Point the web app at a non-default worker with `VITE_API_URL=http://127.0.0.1:8787 npm run dev:web` (harness uses `scripts/harness-env.sh` for ports).

### Data refresh
- Trigger local ingestion: `curl -fsS http://127.0.0.1:8787/__pipeline/run/ingestion`
- Trigger deployed ingestion (requires `.env.remote` with `DEPLOYED_PIPELINE_URL` and `PIPELINE_ADMIN_TOKEN`): `npm run refresh:remote`
- Seed historical backfill: `./scripts/backfill-history.sh`

### Verification
- From repo root: `npm test` (worker typecheck and tests, web tests and build, then the deterministic replay harness with Playwright).
- Worker scheduled smoke (live sources only): `npm --prefix workers/senate_data_worker run smoke:scheduled`

### UI screenshots
- **Agents (hermetic replay):** `npm run screenshot:replay` — starts the worker with explicit replay vars (`DATA_SOURCE=replay`, `REPLAY_FIXTURE_SET=canonical`, fixed `CLOCK`), ingests, asserts API data, starts Vite against that worker, writes mobile PNGs under `target/screenshots/`. Does not use `.dev.vars` for data source.
- **Docs images:** `npm run docs:snapshots` — runs the replay screenshot flow and copies outputs into `docs/screenshots/`. See `docs/AGENTS.md`.
- **Manual / desktop:** With dev servers already running: `npm run snapshot` (Playwright Chromium; set `URL` if not on `:5173`; `FULL_PAGE=1` for full-page capture).

### UI and design review
- Prefer `npm run screenshot:replay` over hand-starting worker/web with `.dev.vars`. For interactive debugging, replay still uses explicit vars via the harness scripts; live ingestion requires `DATA_SOURCE=live` (not omitting `DATA_SOURCE`) plus real API keys in `.dev.vars` or secrets.
- Replay-backed preview deploys use `[env.preview]` in `workers/senate_data_worker/wrangler.toml` (`wrangler deploy --env preview`).

## Key Rules
- Prefer the commands above over guessing root-level npm scripts.
- Default to `npm test` for verification; inspect `target/harness/` (including `assertions/`) when the harness step fails.
- When changing ingestion, read both worker pipeline code and read-model/API surfaces.
- For data freshness issues, check both `/briefings/latest.json` and pipeline status before changing code.
- Use the local pipeline endpoint to repopulate the latest briefing/feed data after pipeline changes.
- Prefer fixtures, cached artifacts, and existing tests over repeated live pulls from Congress.gov or GovInfo during development.
- Never commit secrets from `.dev.vars` or local Wrangler state.
- Commit and push directly to `main` when explicitly requested and validation is green; create a feature branch and PR when explicitly requested.

## Freshness And Debugging
- Harness artifacts, including Playwright failure assets, land in `target/harness/`. Replay screenshot runs use `target/screenshots/` (state, logs, assertions, PNGs).
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
- `workers/senate_data_worker/src/pipeline/ingestion-helpers.ts` — ingestion helpers (vote menu fetch, activity-index fallback, evidence attach)
- `workers/senate_data_worker/src/pipeline/jobs.ts` — queue processing and historical backfill
- `workers/senate_data_worker/src/pipeline/materialize.ts` — evidence harvest and read-model publish
- `workers/senate_data_worker/src/pipeline/logging.ts` — pipeline run IDs, timing, coverage logging
- `workers/senate_data_worker/src/http/router.ts` — HTTP router (public reads + `/__pipeline/*` admin)
- `workers/senate_data_worker/src/read-model.ts` — briefing/detail materialization builders
- `workers/senate_data_worker/src/storage/` — document key helpers and D1 read repositories (health, pipeline status)
- `workers/senate_data_worker/src/sources/` — shared HTTP/XML/Congress.gov clients
- `workers/senate_data_worker/src/d1/` — D1 schema (`schema.ts` / `PLATFORM_SCHEMA_SQL`), `schema-drift.test.ts`, `kv_documents` JSON store (`documents.ts`), and write paths
- `web/src/` — frontend app and API client

## Notes
- Storage is D1-only: normalized tables plus `kv_documents` for pipeline JSON (ledger, activities, bill evidence, caches).
- The public API exposes only `/briefings/latest.json`, `/votes/:c/:s/:n.json`, `/health`, and `/health/data`; `/__pipeline/*` admin routes are token-gated on deploy.
- The latest homepage feed is served from `/briefings/latest.json`.
- One unified worker handles ingestion/materialization and serving; scheduled (cron) ingestion is not triggered automatically in local dev.
- Local stack ports: Worker `http://127.0.0.1:8787`, Web `http://127.0.0.1:5173`.
- The deterministic harness exercises the real local worker in replay mode (`DATA_SOURCE=replay`); there is no frontend fixture data file.

## Cursor Cloud

Solo-contributor workflow: push fixes directly to `main` (no PRs or `cursor/*` branches) unless the user asks otherwise.

Repo-level agent VMs use `.cursor/environment.json`. On each start, Cursor runs `./scripts/cursor-cloud-setup.sh`. Start `npm run dev:worker` and `npm run dev:web` in separate terminals when you need the local stack.

- End-to-end check: `npm test`.
- Store real `CONGRESS_API_KEY` / `GOVINFO_API_KEY` in Cursor **Secrets**, not in committed files, when testing live ingestion.
- CI uses Node.js 20 (`.github/workflows/ci.yml`); there is no `.nvmrc` — Node 20+ is sufficient.
