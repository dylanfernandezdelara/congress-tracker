# Congress Tracker

`congress-tracker` is a Cloudflare-native Senate vote intelligence app. It ingests official Senate and congressional data, builds a normalized read model for recent and historical voting context, and serves a ranked feed of the most relevant Senate votes plus vote-detail pages.

## Developer Quick Start

### Runtime surfaces

- Worker (`workers/senate_data_worker/wrangler.toml`): a single Cloudflare Worker that serves the read-only API (for example `/briefings/latest.json`), exposes the `/__pipeline/*` admin routes, consumes queue jobs, and runs cron-driven ingestion/materialization that refreshes D1 (normalized tables + `kv_documents` JSON).
- Web app (`web/`): Vite + React frontend.

### Run locally (exact commands)

In separate terminals:

```bash
npm run dev:worker
npm run dev:web
```

Then open `http://127.0.0.1:5173`. If the briefing feed is empty, trigger ingestion on the worker (see **Development** below).

For one-time local setup (`npm install`, `.dev.vars`), see the **Development** section below.

## Architecture

The project has two runtime surfaces:

- `workers/senate_data_worker/wrangler.toml`
  Unified Worker. Read-only HTTP endpoints for the web app, plus cron-driven ingestion, queue consumption, normalization, read-model materialization, and `/__pipeline/*` admin routes.
- `web/`
  Vite + React frontend for the ranked homepage and vote detail pages.

Storage is D1-only:

- **Normalized tables** — votes, members, issue threads, ingested vote details, pipeline checkpoints, and related read-model rows.
- **`kv_documents`** — JSON blobs for pipeline artifacts (`votes/ledger.json`, `activities/index.json`, bill evidence/trends, chamber context, and similar).
- **Queues** (optional) — retryable background work for historical backfill chunks and read-model materialization.

```text
Official Sources
  Senate.gov votes/XML
  Congress.gov API
  GovInfo API
  Senate floor logs
        |
        v
Unified Worker
  pipeline: cron -> fetch -> normalize -> enrich -> materialize
        |   +--> D1 (tables + kv_documents)
        |   +--> Queue jobs (when configured)
        |
  api:  GET /briefings/latest.json
        GET /votes/:congress/:session/:voteNumber.json
        GET /health, GET /health/data
        |
        v
Web App
  ranked feed
  vote detail pages
```

## Data Sources

The pipeline is designed around official or official-adjacent sources:

- `Senate.gov`
  Senate roll-call XML, vote archives, floor schedule, committee schedule.
- `Congress.gov API`
  Bill metadata, summaries, actions, related bills, committee meetings, hearing records, CRS products.
- `GovInfo API`
  Congressional Record text and metadata.
- `Senate Periodical Press Gallery floor logs`
  Same-day procedural context around proceedings and cloture activity.

The interpretation layer is intentionally constrained:

- Deterministic evidence assembly and ranking happen first.
- Coverage gaps are rendered explicitly instead of being filled in heuristically.

## Current Product Shape

- Homepage
  Ranked feed of recent Senate votes showing what happened, why it matters, and who crossed party lines.
- Vote detail page
  Vote overview, party breakdowns, crossover senators, historical thread context, and argument summaries from bill context plus tally-derived party positions when excerpt-level record text is unavailable.

## Repository Layout

```text
congress-tracker/
├── web/
│   └── src/
├── workers/
│   └── senate_data_worker/
│       ├── migrations/
│       ├── scripts/
│       ├── src/
│       │   ├── worker.ts
│       │   ├── http/router.ts
│       │   ├── pipeline/   (scheduled ingestion, jobs, materialize, stages)
│       │   ├── storage/    (document keys, D1 read repos, schema-once)
│       │   ├── sources/    (HTTP/XML/Congress.gov clients)
│       │   ├── congress/   (Congress.gov client modules)
│       │   ├── member-ingest/ (member activity ingestion)
│       │   ├── contract.ts (shared API payload types for web)
│       │   ├── d1/         (schema, kv_documents, materialization writes)
│       │   └── read-model.ts
│       └── wrangler.toml
└── scripts/
```

## Cloudflare Setup

### Required resources

Create the following resources before deploying:

1. `D1` database for normalized tables, `kv_documents`, and materialized briefing/vote payloads.
2. `Queue` for pipeline jobs (optional until you enable queue producers/consumers).

Example resource creation:

```bash
cd workers/senate_data_worker

npx wrangler d1 create senate-platform
npx wrangler queues create senate-platform-jobs
```

After creation, update the Wrangler config:

- `workers/senate_data_worker/wrangler.toml`

Uncomment and fill in:

- `[[d1_databases]]`
- `[[queues.producers]]` and `[[queues.consumers]]` (the unified worker is both)

### Runtime variables and secrets

Non-secret vars live in the Wrangler configs:

```toml
[vars]
CONGRESS = "119"
SESSION = "2"
TARGET_STATE = "ALL"
# ALLOWED_ORIGIN = "https://your-site.example"
```

Required secrets:

- `CONGRESS_API_KEY`
- `GOVINFO_API_KEY`

Deterministic harness runs do not require live upstream secrets. They start the worker with:

- `DATA_SOURCE=replay`
- `REPLAY_FIXTURE_SET=canonical`
- `CLOCK=2026-01-20T15:00:00Z`

Set local secrets in `workers/senate_data_worker/.dev.vars`.
Set deployed secrets with Wrangler:

```bash
cd workers/senate_data_worker
npx wrangler secret put CONGRESS_API_KEY
npx wrangler secret put GOVINFO_API_KEY
```

### D1 schema

The platform read-model schema lives in:

- `workers/senate_data_worker/migrations/0001_platform_read_model.sql`
- `workers/senate_data_worker/migrations/0002_pipeline_state.sql`
- `workers/senate_data_worker/migrations/0003_issue_key.sql`
- `workers/senate_data_worker/migrations/0004_ingested_vote_details.sql`
- `workers/senate_data_worker/migrations/0005_kv_documents.sql`
- `workers/senate_data_worker/migrations/0006_drop_ghost_tables.sql`

`PLATFORM_SCHEMA_SQL` in `workers/senate_data_worker/src/d1/schema.ts` is the canonical current-state schema. `migrations/*.sql` is append-only deploy history (Wrangler); `src/d1/schema-drift.test.ts` guards that migrations' net effect matches the canonical schema.

## Development

### Local setup (first run)

Create a local worker env file:

```bash
cp workers/senate_data_worker/.dev.vars.example workers/senate_data_worker/.dev.vars
```

Required local secrets in `workers/senate_data_worker/.dev.vars`:

- `CONGRESS_API_KEY`
- `GOVINFO_API_KEY`

Evidence thresholds (`EVIDENCE_*`, `ACTIVITY_LOOKBACK_DAYS`, `DATA_FRESHNESS_MAX_HOURS`) have code defaults and are overridable via env when tuning.
### Install dependencies

```bash
npm --prefix workers/senate_data_worker install
npm --prefix web install
```

### Run the split stack locally

```bash
npm run dev:worker
npm run dev:web
```

- Unified Worker at `http://127.0.0.1:8787`
- Web app at `http://127.0.0.1:5173`

The repo ships with a local `D1` binding enabled in the Wrangler config so queue, evidence, and read-model code can run end to end during local development without provisioning a remote database first.

Scheduled (cron) ingestion is not triggered automatically in local development.

### Trigger pipeline ingestion locally

```bash
curl -fsS http://127.0.0.1:8787/__pipeline/run/ingestion
```

This targets the local worker and triggers the same backend-owned ingestion path used by cron. The worker checks D1 ingestion state first, then fetches only missing vote details.

Typical local startup flow:

1. Start the worker and web (`npm run dev:worker`, `npm run dev:web`).
2. Trigger `/__pipeline/run/ingestion` if you need fresh data immediately.
3. Verify freshness with `http://127.0.0.1:8787/__pipeline/status` and `http://127.0.0.1:8787/briefings/latest.json`.
4. Open `http://127.0.0.1:5173`.

### UI screenshots

With the web dev server running:

```bash
npm run snapshot
```

### Seed historical backfill locally

```bash
./scripts/backfill-history.sh
```

Useful environment overrides:

- `START_CONGRESS=119`
- `END_CONGRESS=116`
- `SESSION_FILTER=all`

The local worker also exposes admin endpoints for debugging:

- `GET /__pipeline/status`
- `GET` or `POST /__pipeline/run/ingestion`
- `GET` or `POST /__pipeline/run/materialize`
- `GET /__pipeline/run/historical-backfill?congress=116`

On the deployed worker, `/__pipeline/status` and `/__pipeline/run/*`
require `Authorization: Bearer $PIPELINE_ADMIN_TOKEN`. Prefer `POST` for
`/__pipeline/run/*` on production (`npm run refresh:remote` does this).
Set the secret with Wrangler before exposing the worker publicly.
Localhost and deterministic harness runs are allowed without the token for
development.

### Rate-limit aware development

The source adapters are intentionally conservative:

- bounded concurrency
- retry with backoff and `Retry-After` support
- cached upstream reuse through `source_fetch_log` and D1 `kv_documents` where applicable
- resumable historical backfill checkpoints in `pipeline_checkpoints`
- replay-driven tests preferred over repeated live API pulls

Use replay mode and existing tests for most development work instead of repeatedly hitting Congress.gov or GovInfo.

## Testing

From the repo root (worker typecheck and tests, web tests and build, deterministic replay harness with Playwright):

```bash
npm test
```

Harness debug artifacts, including browser failure assets, are written to `target/harness/`.

Scheduled-handler smoke test (live upstream sources):

```bash
npm --prefix workers/senate_data_worker run smoke:scheduled
```

Maintainer-only fixture refresh:

```bash
npm --prefix workers/senate_data_worker run fixtures:harness:refresh
```

The refresh script captures the canonical upstream URLs and writes a generated fixture module for review; it is intended for maintainers rebasing the deterministic harness story, not for routine development.

## Deployment

Deploy the unified worker:

```bash
cd workers/senate_data_worker
npm run deploy
```

Replay-backed preview environment (`[env.preview]` in `wrangler.toml`):

```bash
cd workers/senate_data_worker
npx wrangler deploy --env preview
```

Recommended deployment order:

1. Create D1 (and Queue, if used) resources.
2. Apply the D1 schema migration.
3. Deploy the worker.
4. Trigger a pipeline run and verify the read model.

## HTTP API

Product endpoints (served from D1 read models):

- `GET /briefings/latest.json` — ranked recent-vote feed for the homepage.
- `GET /votes/:congress/:session/:voteNumber.json` — vote detail with party breakdowns, recurrence context, crossovers, and argument summaries.

Operational endpoints:

- `GET /health` — worker liveness.
- `GET /health/data` — briefing freshness from `daily_briefings` (503 when stale or missing).

Pipeline admin routes (token-gated on the deployed worker):

- `GET /__pipeline/status`
- `GET` or `POST /__pipeline/run/ingestion`
- `GET` or `POST /__pipeline/run/materialize`
- `GET` or `POST /__pipeline/run/historical-backfill?congress=…&session=…`

Ledger, activities index, session overview, and bill evidence remain internal `kv_documents` keys written by the pipeline; they are not exposed as public API routes.

## Frontend

The redesigned frontend is intentionally simpler than the original dashboard:

- home is a ranked feed, not an analytics grid
- vote cards explain why an item surfaced
- detail pages carry the research depth
- older dashboard modules are no longer on the landing page

## Notes

- The worker serves materialized briefing and vote-detail JSON from D1 only; missing materialization returns 404 until the pipeline runs.
- Verbatim Congressional Record floor-quote extraction is not part of the current pipeline; vote pages use bill summaries and tally-derived party summaries when excerpt tables are empty.
- Filibuster treatment in v1 stays limited to cloture/procedural context rather than a historical leaderboard.
