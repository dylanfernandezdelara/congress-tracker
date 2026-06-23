# Production data ingest

Congress Tracker keeps D1 fresh with **automatic daily ingest** plus an **admin override** you can run any time.

## Automatic ingest (production)

| Mechanism | Schedule | What it runs |
|-----------|----------|--------------|
| Cloudflare Worker cron | **10:00 UTC daily** (`0 10 * * *` in `wrangler.toml`) | `runFeedPipeline` via the Worker's `scheduled` handler |
| GitHub Actions backup | **10:30 UTC daily** (`.github/workflows/daily-ingest.yml`) | `POST /__pipeline/run/feed` with `PIPELINE_ADMIN_TOKEN` |

The pipeline only upserts **new** passage roll-call votes in the lookback window and writes digests for bills that do not yet have one (capped by `DIGEST_MAX_NEW_REWRITES`).

**Important:** A stale-looking feed date does not always mean ingest is broken. If Congress has not held new passage votes, the newest item date will not move even when cron runs successfully.

## Check freshness without logs

```bash
curl -fsS https://congress-tracker-api.fernandezdelaradylan.workers.dev/health | jq '.data'
```

Response fields:

- `latest_passage_vote_date` — newest passage vote currently stored in D1
- `last_feed_ingest` — timestamp + counts from the most recent successful feed pipeline run (`trigger`: `scheduled` or `admin`)
- `daily_cron_utc` — configured cron expression
- `admin_feed_ingest` — manual override route

## Admin override (manual ingest)

Production already exposes a secured admin route:

```bash
POST /__pipeline/run/feed
Authorization: Bearer <PIPELINE_ADMIN_TOKEN>
```

Local dev without a token: set `DEV_OPEN_PIPELINE=1` in `.dev.vars` (never in production).

Convenience script (from repo root):

```bash
PIPELINE_ADMIN_TOKEN='…' ./scripts/trigger-production-ingest.sh
```

Optional: `WORKER_URL=https://your-worker.example` to target a non-default origin.

Other admin routes (same Bearer auth):

- `POST /__pipeline/run/session-backfill` — backfill historical passage votes
- `POST /__pipeline/run/member-votes` — per-member vote rows for sidebar stats
- `POST /__pipeline/run/digest-refresh?bill=HR1234&bills=S.2` — force digest rewrites

## GitHub Actions backup setup

The backup workflow **requires** a repository secret:

1. Set the Worker secret once: `wrangler secret put PIPELINE_ADMIN_TOKEN`
2. Add the **same value** to GitHub → Settings → Secrets → Actions as `PIPELINE_ADMIN_TOKEN`
3. Optionally set repository variable `WORKER_URL` if the workers.dev hostname changes

Without that secret, the scheduled workflow fails immediately (it does not call the Worker).

## Deploy vs data freshness

- **Worker deploy** (Cloudflare Workers Builds on `main`) ships code + static UI.
- **D1 data** updates on the cron/admin pipeline, independent of deploy cadence.

After changing cron settings in `wrangler.toml`, production deploy applies them (`wrangler deploy`). Preview uploads (`versions upload`) do not receive cron triggers.
