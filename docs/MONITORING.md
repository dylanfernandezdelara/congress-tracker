# Ingest monitoring

Daily feed ingest runs via the Cloudflare Worker cron (`0 10 * * *` UTC). Executive
posts ingest runs hourly at minute 20 (`20 * * * *` UTC). The offset keeps the two
crons on distinct minutes so they cannot race for the single shared D1 write lease
(a collision silently skips the daily feed). Each feed run records success or failure
in D1 so you can tell whether the **scheduled** pipeline completed recently.

If the daily cron loses the shared write lease, it records `last_skipped` (reason
`pipeline_busy`) without changing `status` / `last_success` / `last_failure`. Treat
`last_skipped` as an **actionable alert signal**: it is a durable trace
`{ skipped_at, trigger, reason: "pipeline_busy" }` for a scheduled feed ingest that
aborted because another pipeline held the lease. Nothing errored, so `last_failure`
stays empty and no error log is emitted, yet no new feed data landed — the signature
of a stale-but-not-failed day. If `skipped_at` is at or after the most recent expected
daily cron firing (`0 10 * * *` UTC) and there is no corresponding
`last_scheduled_success` for that day, that day's ingest never ran. The field is on
`GET /debug/ingest.json` and on the internal `/debug` page.

## Status endpoints

| Endpoint | Use |
|----------|-----|
| `GET /health` | Liveness + `data.ingest` summary (cache-friendly) |
| `GET /debug/ingest.json` | Full ingest monitor payload + alerting hints |
| `/debug` (web) | Human-readable ops page (not linked in nav) |

### Status values

| Status | Meaning |
|--------|---------|
| `ok` | Last **scheduled** run succeeded within the stale window (26h) |
| `stale` | Last scheduled success is older than 26h |
| `failed` | A failure is recorded newer than the last scheduled success |
| `unknown` | No scheduled success recorded yet (admin-only runs do not count) |

Admin-triggered runs (`POST /__pipeline/run/feed`) update `last_success` but do not satisfy
scheduled freshness on their own.

## Alerting options

1. **Cloudflare Workers Observability** — filter logs for `feed_pipeline_failed` or cron
   `0 10 * * *`. Failed runs also log structured JSON from the scheduled handler.
   Also check `last_skipped` on `/debug/ingest.json` for lease-contention skips that
   leave no failure log.

2. **External uptime monitor** — poll `/health` or `/debug/ingest.json` and alert when
   `data.ingest.status` (or `ingest.status`) is not `ok`, or when top-level `/health`
   `status` is `degraded` (ingest stale or failed).

3. **Manual override** — `POST /__pipeline/run/feed` with
   `Authorization: Bearer <PIPELINE_ADMIN_TOKEN>`.

## D1 storage

The `pipeline_state` table stores JSON blobs:

- `feed_pipeline_last_success` — last run result (includes `trigger`: `scheduled` | `admin`)
- `feed_pipeline_last_scheduled_success` — last **scheduled** success (admin runs do not overwrite)
- `feed_pipeline_last_failure` — last error message and timestamp
- `feed_pipeline_last_skipped` — last busy-skip (lease held); does not affect `status` (see
  intro: alert on a `skipped_at` with no matching scheduled success)
- `executive_posts_pipeline_last_success` — last executive run result (any trigger)
- `executive_posts_pipeline_last_scheduled_success` — last **scheduled** executive success; the
  hourly cron's health is read from this key, so a manual run cannot make a broken cron look
  healthy or a healthy one look broken
- `executive_posts_pipeline_last_failure` — last executive error message and timestamp

Both pipelines split "last run" from "last scheduled run" for the same reason: `status` answers
"is the cron healthy?", and admin runs must not be able to answer it. Until the next scheduled
executive run writes the key after deploy, the executive status reads `unknown` rather than
guessing.

Schema is created lazily via `ensureSchema` on first pipeline run after deploy.

## Local development

After `npm run seed` or a local pipeline run, status may still be `unknown` until a run with
`trigger: "scheduled"` is recorded. Cron does not fire in `wrangler dev` by default; use
`POST /__pipeline/run/feed` for manual runs.
