# Ingest monitoring

Crons (UTC): daily feed `0 10 * * *`, hourly executive `20 * * * *`. Distinct
minutes avoid write-lease collisions.

Scheduled runs persist success/failure in D1. A busy lease records
`last_skipped` (`pipeline_busy`) without changing status fields — alert when
`last_skipped` exists and is not superseded by a later scheduled success
(`last_scheduled_success.completed_at` after `skipped_at`). Sticky non-null
alone is not an alarm.

## Endpoints

| Endpoint | Use |
|----------|-----|
| `GET /health` | Liveness + `data.ingest` |
| `GET /debug/ingest.json` | Full monitor payload |
| `/debug` | Ops UI (not in nav) |
| `POST /__pipeline/senate-vote-menu` | Admin: upload Senate LIS vote-menu XML into D1 cache (`?run_feed=1` to ingest) |

**Ops base URL:** Bot Fight Mode on `trackcongress.org` challenges non-browser
clients. Prefer the workers.dev hostname for automation:

`https://congress-tracker-api.fernandezdelaradylan.workers.dev`

## Status

| Status | Meaning |
|--------|---------|
| `ok` | Last scheduled success within 26h, no chamber source warnings |
| `degraded` | Scheduled success within window, but a chamber used stale fallback (today: Senate.gov 403 → D1 menu cache) |
| `stale` | Last scheduled success older than 26h |
| `failed` | Failure newer than last scheduled success |
| `unknown` | No scheduled success yet |

Admin runs update `last_success` only; they do not satisfy scheduled freshness.
Top-level `/health` `status` is `degraded` whenever ingest status is not `ok`.

## Senate.gov 403 (known blocker)

Cloudflare Worker egress is frequently blocked by Senate.gov/Akamai (`HTTP 403`
on `vote_menu_*.xml`). The feed cron then serves the D1
`senate_vote_menu_cache_*` blob and records `chamber_warnings`, which now marks
ingest **`degraded`** (previously this stayed `ok` and looked healthy while
Senate data froze).

**Refresh from a non-blocked host** (Cursor Cloud, laptop, automation):

```bash
# Preferred: admin upload + optional immediate feed run
PIPELINE_ADMIN_TOKEN=... RUN_FEED=1 CHECK_HEALTH=1 \
  npm run refresh:senate-menu

# Or write D1 cache only (needs CLOUDFLARE_API_TOKEN); wait for cron or run feed
REFRESH_VIA=d1 npm run refresh:senate-menu
```

## Alerting

1. **Workers Observability** — `feed_pipeline_failed` / cron strings; also check
   `last_skipped` (lease skips leave no failure log). Alert only when
   `last_skipped` exists and
   `last_scheduled_success.completed_at` is missing or not after
   `skipped_at` — the field is sticky and non-null alone is not an alarm.
2. **Uptime** — poll workers.dev `/health` or `/debug/ingest.json` and alert when
   `data.ingest.status` is not `ok` (or top-level `degraded`).
3. **Manual** — `POST /__pipeline/run/feed` with
   `Authorization: Bearer <PIPELINE_ADMIN_TOKEN>`.
4. **Cursor Automation (recommended)** — schedule a daily cloud agent that:
   - Fetches the live Senate vote menu (this environment can reach senate.gov)
   - Runs `PIPELINE_ADMIN_TOKEN=... RUN_FEED=1 CHECK_HEALTH=1 npm run refresh:senate-menu`
   - Notifies you when the script exits non-zero (`degraded` / `failed` / fetch errors)

   Suggested automation prompt:

   > On repo `congress-tracker`, run production Senate menu refresh + feed:
   > `PIPELINE_ADMIN_TOKEN=$PIPELINE_ADMIN_TOKEN RUN_FEED=1 CHECK_HEALTH=1 npm run refresh:senate-menu`
   > using workers.dev (not trackcongress.org). If exit code ≠ 0, treat as a
   > production ingest blocker and notify me with `/health` JSON and the script
   > logs. Do not open a PR unless code changes are required to clear the blocker.
   > Ensure secrets `PIPELINE_ADMIN_TOKEN`, `CLOUDFLARE_API_TOKEN`, and
   > `CLOUDFLARE_ACCOUNT_ID` are available to the automation environment.

## Edge cache (feed / stats JSON)

Public JSON uses `Cache-Control: s-maxage=60, stale-while-revalidate=30`.
Successful pipeline runs (admin + cron) also call Cloudflare
`purge_everything` for the production zone when `CF_ZONE_ID` +
`CACHE_PURGE_TOKEN` are set (free plans cannot prefix-purge only `/stats/*`).

After a manual D1 repair (or any write outside the pipeline), purge explicitly:

```bash
curl -fsS -X POST https://congress-tracker-api.fernandezdelaradylan.workers.dev/__pipeline/purge-cache \
  -H "Authorization: Bearer $PIPELINE_ADMIN_TOKEN"
```

`CACHE_PURGE_TOKEN` is a Worker secret (`wrangler secret put CACHE_PURGE_TOKEN`)
with Zone → Cache Purge permission. Preview sets `CF_ZONE_ID=""`.

## D1 keys (`pipeline_state`)

Feed: `feed_pipeline_last_success`, `…_last_scheduled_success`, `…_last_failure`,
`…_last_skipped`.

Executive: `executive_posts_pipeline_last_success`, `…_last_scheduled_success`,
`…_last_failure`.

Senate menu fallback: `senate_vote_menu_cache_{congress}_{session}`.

Both split last-run vs last-scheduled-run so `status` answers "is the cron
healthy?" only. Schema is created via `ensureSchema` on first pipeline run.

## Local

Cron does not fire in `wrangler dev`. Status stays `unknown` until a
`trigger: "scheduled"` run is recorded; use `POST /__pipeline/run/feed`.
