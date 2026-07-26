# Ingest monitoring

Crons (UTC): daily feed `0 10 * * *`, hourly executive `20 * * * *`. Distinct
minutes avoid write-lease collisions.

Scheduled runs persist success/failure in D1. A busy lease records
`last_skipped` (`pipeline_busy`) without changing status fields — alert when
that skip has no matching scheduled success for the day.

## Endpoints

| Endpoint | Use |
|----------|-----|
| `GET /health` | Liveness + `data.ingest` |
| `GET /debug/ingest.json` | Full monitor payload |
| `/debug` | Ops UI (not in nav) |

## Status

| Status | Meaning |
|--------|---------|
| `ok` | Last scheduled success within 26h |
| `stale` | Last scheduled success older than 26h |
| `failed` | Failure newer than last scheduled success |
| `unknown` | No scheduled success yet |

Admin runs update `last_success` only; they do not satisfy scheduled freshness.

## Alerting

1. **Workers Observability** — `feed_pipeline_failed` / cron strings; also check
   `last_skipped` (lease skips leave no failure log).
2. **Uptime** — poll `/health` or `/debug/ingest.json` when status ≠ `ok` (or
   top-level `degraded`).
3. **Manual** — `POST /__pipeline/run/feed` with
   `Authorization: Bearer <PIPELINE_ADMIN_TOKEN>`.

## D1 keys (`pipeline_state`)

Feed: `feed_pipeline_last_success`, `…_last_scheduled_success`, `…_last_failure`,
`…_last_skipped`.

Executive: `executive_posts_pipeline_last_success`, `…_last_scheduled_success`,
`…_last_failure`.

Both split last-run vs last-scheduled-run so `status` answers "is the cron
healthy?" only. Schema is created via `ensureSchema` on first pipeline run.

## Local

Cron does not fire in `wrangler dev`. Status stays `unknown` until a
`trigger: "scheduled"` run is recorded; use `POST /__pipeline/run/feed`.
