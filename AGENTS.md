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
- `CONGRESS_API_KEY` and `GOVINFO_API_KEY` are required only for **live ingestion** against Congress.gov/GovInfo; placeholder values from the example file are enough for harness runs, `./scripts/dev-all.sh` with fixture data, and fixture UI mode.
- Optional local synthesis settings: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_APP_REFERER`, `OPENROUTER_APP_TITLE`, `OPENROUTER_SHADOW_MODE`, `OPENROUTER_CANARY_PERCENT`, `OPENROUTER_MAX_NEW_ANALYSES`.
- Deterministic harness runs do not require live upstream secrets; they boot workers with `HARNESS_MODE=fixture`, `HARNESS_FIXTURE_SET=canonical`, and a fixed `HARNESS_NOW`.
- Local D1 bindings are already configured in the Wrangler config; do not change remote resource IDs just to make local development work.

### Local development
- Full stack: `./scripts/dev-all.sh` (or `npm run dev` from the repo root)
- Worker only: `npm --prefix workers/senate_data_worker run dev`
- Web only: `npm --prefix web run dev`
- Web only with fixture briefing (no worker): `VITE_FORCE_E2E=1 npm --prefix web run dev`

### Data refresh
- Trigger local ingestion: `curl -fsS http://127.0.0.1:8787/__pipeline/run/ingestion`
- Trigger deployed ingestion (requires `.env.remote` with `DEPLOYED_PIPELINE_URL` and `PIPELINE_ADMIN_TOKEN`): `npm run refresh:remote`
- Seed historical backfill: `./scripts/backfill-history.sh`

### Verification
- Full deterministic harness: `npm run harness:ci`
- Harness browser checks only: `npm run harness:browser`
- Worker typecheck: `npm --prefix workers/senate_data_worker run check`
- Worker tests: `npm --prefix workers/senate_data_worker test`
- Worker scheduled smoke test: `npm --prefix workers/senate_data_worker run smoke:scheduled`
- Web tests: `npm --prefix web test`
- Web build: `npm --prefix web run build`

### Frontend fixture review mode (fake briefing data)
- For manual UI testing, design review, or static preview deploys, use the baked-in fixture briefing in `web/src/e2eData.ts` instead of live API data.
- Local toggle: open the app with `/?e2e=1` (vote detail links preserve the query param).
- Build-time toggle: set `VITE_FORCE_E2E=1` when running `npm --prefix web run build` so fixture mode is baked into the bundle without a URL param.
- Shared detection lives in `web/src/utils/e2eMode.ts` (`isE2eMode()`).
- Cloudflare Pages preview deploys use `.github/workflows/cloudflare-pages-preview.yml`, which builds with `VITE_FORCE_E2E=1`, deploys via `web/wrangler.toml` (`congress-tracker-dev`), and posts/updates a sticky PR comment with the branch preview URL (requires `CLOUDFLARE_API_TOKEN` in repo secrets).
- Preview worker config for fixture-backed deploys: `workers/senate_data_worker/wrangler.dev.toml`.
- This fixture path is for frontend review and preview smoke checks only. CI truth for end-to-end behavior remains `npm run harness:ci`, which exercises the local worker and deterministic harness fixtures.

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
- Frontend changes: run `npm run harness:ci`. For design-only review or quick UI checks without the worker stack, use fake briefing data via `/?e2e=1` or `VITE_FORCE_E2E=1 npm --prefix web run build`; `npm --prefix web run ui:snap` also appends `e2e=1`. These paths are not the CI truth path.

## Freshness And Debugging
- Deterministic harness artifacts, including Playwright failure assets, land in `target/harness/`.
- The canonical harness fixture corpus lives behind `HARNESS_FIXTURE_SET=canonical`; refresh it with `npm --prefix workers/senate_data_worker run fixtures:harness:refresh` when intentionally re-basing the deterministic story.
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
- `workers/senate_data_worker/src/d1/` — D1 schema, `kv_documents` JSON store (`documents.ts`), and write paths
- `web/src/` — frontend app and API client

## Notes
- Storage is D1-only: normalized tables plus `kv_documents` for pipeline JSON (ledger, activities, bill evidence, caches).
- The public API exposes only `/briefings/latest.json`, `/votes/:c/:s/:n.json`, `/health`, and `/health/data`; `/__pipeline/*` admin routes are token-gated on deploy.
- The latest homepage feed is served from `/briefings/latest.json`.
- One unified worker handles ingestion/materialization and serving; scheduled (cron) ingestion is not triggered automatically in local dev.
- Local stack ports from the repo scripts: Worker `http://127.0.0.1:8787`, Web `http://127.0.0.1:5173`.
- `web/src/e2eData.ts` supplies fake briefing and vote detail data for fixture review mode (`/?e2e=1` or `VITE_FORCE_E2E=1`). The deterministic harness exercises the live local worker instead.

## Cursor Cloud

Repo-level agent VMs use `.cursor/environment.json`. On each start, Cursor runs `./scripts/cursor-cloud-setup.sh` (`npm ci` in `workers/senate_data_worker` and `web`, Playwright Chromium, creates `.dev.vars` from `.dev.vars.example` when missing). Optional **terminals** start `./scripts/dev-all.sh` or fixture-mode Vite — see **Local development** and **Frontend fixture review mode** above.

- Default end-to-end check: `npm run harness:ci` (see **Verification** under **Commands** for typecheck, unit tests, and build).
- Store real `CONGRESS_API_KEY` / `GOVINFO_API_KEY` in Cursor **Secrets**, not in committed files, when testing live ingestion.
- CI uses Node.js 20 (`.github/workflows/ci.yml`); there is no `.nvmrc` — Node 20+ is sufficient.
