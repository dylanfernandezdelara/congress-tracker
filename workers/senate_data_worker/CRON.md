# Cron Schedule Specification

## Chosen Schedule

**Cron expression**: `0 10 * * *`

**UTC time**: 10:00 UTC daily

**ET mapping**:

- **EST (November–March)**: 05:00 ET (5:00 AM Eastern Standard Time)
- **EDT (March–November)**: 06:00 ET (6:00 AM Eastern Daylight Time)

---

## Rationale

### Goal

Run the Senate data ingestion **once per day**, early enough in the morning (US/Eastern) to:

1. Avoid partial same-day results (intentionally exclude "today" from ingestion)
2. Run before most website traffic begins
3. Stay consistent across EST/EDT transitions

### Why 10:00 UTC?

- **EST (UTC-5)**: 10:00 UTC = 05:00 ET
- **EDT (UTC-4)**: 10:00 UTC = 06:00 ET

Both 5 AM and 6 AM ET are "early morning" times when Senate activity is unlikely to be ongoing and website traffic is low. The 1-hour shift during DST transitions is acceptable and keeps the schedule simple (single cron expression).

### DST Transition Behavior

| Period                     | UTC Cron Time | ET Time | Notes                                  |
|----------------------------|---------------|---------|----------------------------------------|
| Nov–early Mar (EST)        | 10:00 UTC     | 05:00 ET | Standard time (UTC-5)                  |
| Early Mar–Nov (EDT)        | 10:00 UTC     | 06:00 ET | Daylight time (UTC-4)                  |
| DST transition (spring)    | 10:00 UTC     | 06:00 ET | Clock "springs forward" at 02:00 ET    |
| DST transition (fall)      | 10:00 UTC     | 05:00 ET | Clock "falls back" at 02:00 ET         |

**Impact on ingestion**:

- The cron runs at a fixed UTC time, so the worker always executes at the same absolute time.
- The `cutoff_date_et` logic (computing "today" in US/Eastern) handles DST correctly (via IANA timezone conversion).
- On DST transition days, the cron still runs once; the `cutoff_date_et` is computed correctly based on the current ET offset at runtime.

### Alternative Schedules Considered

| Cron Expression | UTC Time | EST Time | EDT Time | Notes                                          |
|-----------------|----------|----------|----------|------------------------------------------------|
| `0 9 * * *`     | 09:00    | 04:00    | 05:00    | Too early in EST (4 AM); acceptable in EDT     |
| `0 10 * * *`    | 10:00    | 05:00    | 06:00    | ✅ **Chosen**: Balanced across EST/EDT         |
| `0 11 * * *`    | 11:00    | 06:00    | 07:00    | Acceptable but slightly later in EDT (7 AM)    |
| `0 12 * * *`    | 12:00    | 07:00    | 08:00    | Too late (8 AM EDT is peak morning traffic)    |

**Why not 9:00 UTC?** 4 AM ET (EST) is arguably too early and may be less useful for debugging (if manual intervention is needed during business hours).

**Why not 11:00 UTC?** 7 AM ET (EDT) starts overlapping with typical morning website traffic; 6 AM ET is preferable.

---

## Wrangler Configuration

Add this to `wrangler.toml`:

```toml
[triggers]
crons = ["0 10 * * *"]
```

---

## Testing the Cron Locally

Use Wrangler's `--test-scheduled` flag to simulate the cron trigger during development:

```bash
npx wrangler dev --test-scheduled
```

This will invoke the `scheduled()` handler without waiting for the actual cron time.

---

## Monitoring & Observability

### Recommended Logs/Metrics

When the scheduled handler runs, log:

- `cutoff_date_et` (ISO date string, e.g., `"2026-01-04"`)
- `target_vote_date` (ISO date string, e.g., `"2025-12-18"`)
- Invariant check: `target_vote_date < cutoff_date_et`
- Duration of ingestion (milliseconds)
- Number of votes processed
- Any errors/warnings

Example log output:

```json
{
  "event": "scheduled_ingestion_start",
  "timestamp": "2026-01-04T10:00:00.123Z",
  "cutoff_date_et": "2026-01-04",
  "congress": 119,
  "session": 1,
  "state": "NY"
}
```

```json
{
  "event": "scheduled_ingestion_complete",
  "timestamp": "2026-01-04T10:00:45.678Z",
  "target_vote_date": "2025-12-18",
  "votes_total": 8,
  "votes_with_state_members": 8,
  "state_member_votes": 16,
  "duration_ms": 45555
}
```

### Alerting

Consider setting up alerts (via Cloudflare Workers Analytics or external monitoring) for:

- Scheduled handler failure (no successful run in 25 hours)
- `target_vote_date == cutoff_date_et` (should never happen; indicates a logic bug)
- Partial ingestion (`partial: true` in `_meta.json`)
- Duration exceeds threshold (e.g., > 2 minutes)

---

## Summary

- **Cron expression**: `0 10 * * *` (10:00 UTC daily)
- **ET mapping**: 5 AM EST / 6 AM EDT
- **DST handling**: Automatic (via IANA timezone conversion in `cutoff_date_et` logic)
- **Testing**: `npx wrangler dev --test-scheduled`
- **Monitoring**: Log `cutoff_date_et`, `target_vote_date`, duration, and vote counts

