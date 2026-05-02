# Daily Senate Update

`daily_senate_update` is a Cloudflare-native Senate vote intelligence app. It ingests official Senate and congressional data, builds a normalized read model for recent and historical voting context, and serves a ranked feed of the most relevant Senate votes plus vote-detail pages.

## Developer Quick Start

### Runtime split (important)

- API worker (`workers/senate_data_worker/wrangler.toml`): serves read-only endpoints for the frontend (for example `/briefings/latest.json`).
- Pipeline worker (`workers/senate_data_worker/wrangler.pipeline.toml`): runs ingestion/materialization to fetch upstream data and refresh D1/R2 data used by the API worker.
- Web app (`web/`): Vite + React frontend.

### Run locally (exact commands)

Run these two commands:

1. Start API + Pipeline + Web:

```bash
./scripts/dev-all.sh
```

2. In a second terminal, pull/refresh latest data:

```bash
./scripts/refresh-data.sh
```

Then open `http://127.0.0.1:5173`.

For one-time local setup (`npm install`, `.dev.vars`), see the `Development` section below.

## Architecture

The project now has three runtime surfaces:

- `workers/senate_data_worker/wrangler.toml`
  API Worker. Read-only HTTP endpoints for the web app.
- `workers/senate_data_worker/wrangler.pipeline.toml`
  Pipeline Worker. Cron-driven ingestion, queue consumption, normalization, and read-model materialization.
- `web/`
  Vite + React frontend for the ranked homepage and vote detail pages.

The backend keeps the Cloudflare stack but no longer treats R2 as the only query surface:

- `R2`
  Raw source payloads, evidence blobs, and cached/materialized JSON payloads.
- `D1`
  Normalized read model for votes, members, issue threads, historical context, argument summaries, and materialized detail payloads.
- `Queues`
  Retryable background work for new-vote enrichment, historical backfill chunks, excerpt extraction, thread updates, and briefing/detail regeneration.

```text
Official Sources
  Senate.gov votes/XML
  Congress.gov API
  GovInfo API
  Senate floor logs
        |
        v
Pipeline Worker
  cron -> fetch -> normalize -> enrich -> materialize
        |               |              |
        |               |              +--> R2 cached JSON / raw artifacts
        |               +-----------------> D1 read model
        +-------------------------------> Queue jobs
                                           |
                                           v
API Worker
  /briefings/latest.json
  /votes/:congress/:session/:voteNumber.json
  legacy R2-backed endpoints
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
- Model-assisted summaries only operate on already-linked evidence.
- Coverage gaps are rendered explicitly instead of being filled in heuristically.

## Current Product Shape

- Homepage
  Ranked feed of recent Senate votes showing what happened, why it matters, and who crossed party lines.
- Vote detail page
  Vote overview, party breakdowns, crossover senators, historical thread context, and sourced argument summaries.
- Legacy API
  Existing R2-backed state/member/session endpoints remain available during migration.

## Repository Layout

```text
daily_senate_update/
├── web/
│   └── src/
├── workers/
│   └── senate_data_worker/
│       ├── migrations/
│       ├── scripts/
│       ├── src/
│       │   ├── api-index.ts
│       │   ├── pipeline-index.ts
│       │   ├── http.ts
│       │   ├── d1.ts
│       │   ├── read-model.ts
│       │   └── index.ts
│       ├── wrangler.toml
│       └── wrangler.pipeline.toml
└── scripts/
```

## Cloudflare Setup

### Required resources

Create the following resources before deploying the full split architecture:

1. `R2` bucket for source artifacts and cached JSON.
2. `D1` database for the normalized read model.
3. `Queue` for pipeline jobs.

Example resource creation:

```bash
cd workers/senate_data_worker

npx wrangler r2 bucket create senate-data-bucket
npx wrangler d1 create senate-platform
npx wrangler queues create senate-platform-jobs
```

After creation, update both Wrangler configs:

- `workers/senate_data_worker/wrangler.toml`
- `workers/senate_data_worker/wrangler.pipeline.toml`

Uncomment and fill in:

- `[[d1_databases]]`
- `[[queues.producers]]`
- `[[queues.consumers]]` in the pipeline config

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

Optional secret/runtime values:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
  Single model slug or a comma-separated fallback list in priority order.
- `OPENROUTER_APP_REFERER`
- `OPENROUTER_APP_TITLE`

Deterministic harness runs do not require live upstream secrets. They start both workers with:

- `HARNESS_MODE=fixture`
- `HARNESS_FIXTURE_SET=canonical`
- `HARNESS_NOW=2026-01-20T15:00:00Z`

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

The worker can also create the same schema lazily through `src/d1.ts`, but the migration file is the preferred deployment path.

## Development

### Local setup (first run)

Create a local worker env file:

```bash
cp workers/senate_data_worker/.dev.vars.example workers/senate_data_worker/.dev.vars
```

Required local secrets in `workers/senate_data_worker/.dev.vars`:

- `CONGRESS_API_KEY`
- `GOVINFO_API_KEY`

Optional local synthesis settings:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_APP_REFERER`
- `OPENROUTER_APP_TITLE`
- `OPENROUTER_SHADOW_MODE`
- `OPENROUTER_CANARY_PERCENT`
- `OPENROUTER_MAX_NEW_ANALYSES`

### Install dependencies

```bash
npm --prefix workers/senate_data_worker install
npm --prefix web install
```

### Run the split stack locally

```bash
./scripts/dev-all.sh
```

This starts:

- API Worker at `http://127.0.0.1:8787`
- Pipeline Worker at `http://127.0.0.1:8788`
- Web app at `http://127.0.0.1:5173`

The repo now ships with a local `D1` binding enabled in both Wrangler configs so queue, evidence, and read-model code can run end to end during local development without provisioning a remote database first.

Scheduled workers are not triggered automatically in local development.

You can also run them individually:

```bash
npm --prefix workers/senate_data_worker run dev:api
npm --prefix workers/senate_data_worker run dev:pipeline
npm --prefix web run dev
```

### Trigger pipeline ingestion locally

```bash
./scripts/refresh-data.sh
```

This targets the local Pipeline Worker and triggers the scheduled ingestion path through the explicit local admin route.

Typical local startup flow:

1. Start the stack with `./scripts/dev-all.sh`.
2. In a second terminal, run `./scripts/refresh-data.sh`.
3. Verify freshness with `http://127.0.0.1:8788/__pipeline/status` and `http://127.0.0.1:8787/briefings/latest.json`.
4. Open `http://127.0.0.1:5173`.

### Run the deterministic harness locally

```bash
npm run harness:ci
```

This boots the API worker, pipeline worker, and web app with isolated local Wrangler state, runs scheduled ingestion against the checked-in fixture corpus, verifies the materialized API outputs, and then runs Playwright against the live local app.

Useful harness subcommands:

```bash
npm run harness:stack
npm run harness:assert
npm run harness:browser
npm run harness:live-smoke
```

The deterministic harness writes debug artifacts, including browser failure assets, to `target/harness/`.

### Seed historical backfill locally

```bash
./scripts/backfill-history.sh
```

Useful environment overrides:

- `START_CONGRESS=119`
- `END_CONGRESS=116`
- `SESSION_FILTER=all`

The local pipeline also exposes admin endpoints for debugging:

- `GET /__pipeline/status`
- `GET /__pipeline/run/ingestion`
- `GET /__pipeline/run/materialize`
- `GET /__pipeline/run/evidence?vote=46`
- `GET /__pipeline/run/historical-backfill?congress=116`

### Rate-limit aware development

The source adapters are intentionally conservative:

- bounded concurrency
- retry with backoff and `Retry-After` support
- cached artifact reuse through `source_fetch_log` + R2 source artifacts
- resumable historical backfill checkpoints in `pipeline_checkpoints`
- fixture-driven tests preferred over repeated live API pulls

Use local fixtures and existing tests for most development work instead of repeatedly hitting Congress.gov or GovInfo.

## Testing

Worker checks:

```bash
npm --prefix workers/senate_data_worker run check
npm --prefix workers/senate_data_worker test
```

Web checks:

```bash
npm --prefix web test
npm --prefix web run build
```

Scheduled-handler smoke test:

```bash
npm --prefix workers/senate_data_worker run smoke:scheduled
```

Deterministic full-stack harness:

```bash
npm run harness:ci
```

Maintainer-only fixture refresh:

```bash
npm --prefix workers/senate_data_worker run fixtures:harness:refresh
```

The refresh script captures the canonical upstream URLs and writes a generated fixture module for review; it is intended for maintainers rebasing the deterministic harness story, not for routine development.

## Deployment

Deploy the API and pipeline workers independently:

```bash
cd workers/senate_data_worker
npm run deploy:api
npm run deploy:pipeline
```

Recommended deployment order:

1. Create R2, D1, and Queue resources.
2. Apply the D1 schema migration.
3. Deploy the Pipeline Worker.
4. Deploy the API Worker.
5. Trigger a pipeline run and verify the read model.

### Dev-only Cloudflare Pages deploy

The frontend can be uploaded to a dev-only Cloudflare Pages project named
`daily-senate-update-dev`:

```bash
cd web
npm run deploy:cloudflare:dev
```

This builds the Vite app and uploads `web/dist` with Wrangler. In non-interactive
environments, set these environment variables before running the command:

```bash
export CLOUDFLARE_ACCOUNT_ID="<your Cloudflare account ID>"
export CLOUDFLARE_API_TOKEN="<token with Account > Cloudflare Pages > Edit>"
```

The dev site will be available at:

```text
https://daily-senate-update-dev.pages.dev
```

Set `VITE_API_URL` when you want the dev site to call a specific API Worker:

```bash
VITE_API_URL="https://your-api-worker.workers.dev" npm run deploy:cloudflare:dev
```

## HTTP API

Primary new endpoints:

- `GET /briefings/latest.json`
  Ranked recent-vote feed for the homepage.
- `GET /votes/:congress/:session/:voteNumber.json`
  Vote detail payload with party breakdowns, recurrence context, crossovers, and argument summaries.

Operational endpoints:

- `GET /health`
- `GET /health/data`

Legacy endpoints retained during migration:

- `GET /state/:state/latest.json`
- `GET /state/:state/:date.json`
- `GET /state/:state/_meta.json`
- `GET /members/index.json`
- `GET /activities/index.json`
- `GET /votes/ledger.json`
- `GET /stats/overview.json`
- `GET /member/:bioguide/latest.json`
- `GET /member/:bioguide/:date.json`

## Frontend

The redesigned frontend is intentionally simpler than the original dashboard:

- home is a ranked feed, not an analytics grid
- vote cards explain why an item surfaced
- detail pages carry the research depth
- older dashboard modules are no longer on the landing page

## Notes

- The current implementation ships the new read model while preserving legacy endpoints.
- D1-backed reads are preferred when the binding exists.
- R2 materialized JSON and derived-on-read fallbacks keep the system usable during migration.
- Filibuster treatment in v1 stays limited to cloture/procedural context rather than a historical leaderboard.
