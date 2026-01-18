# Daily Senate Update

A Cloudflare Worker that ingests Senate roll-call vote XML data, computes state-specific summaries (NY for MVP), and publishes precomputed JSON to R2 for website consumption.

## Overview

This project consists of:

- **Cloudflare Worker** (`workers/senate_data_worker/`): **Production** ingestion + read-only HTTP API (serves your website)
- **Web app** (`web/`): Frontend UI that consumes the Worker API

The Worker runs **once per day** via cron (10:00 UTC / 5-6 AM ET), ingests the most recent complete voting day's data, filters to NY senators, and publishes JSON to R2. Your website can then fetch precomputed JSON without making direct calls to Senate APIs.

## Cloudflare Setup

### Prerequisites

- Cloudflare account with Workers enabled
- Node.js 18+ and npm installed
- Wrangler CLI (installed via npm in the worker directory)

### 1. Create R2 Bucket

Create an R2 bucket to store the JSON artifacts:

```bash
# Using Cloudflare Dashboard:
# 1. Go to R2 → Create bucket
# 2. Name it: senate-data-bucket (or your preferred name)
# 3. Note: No public access needed (Worker accesses via binding)

# Or using Wrangler CLI:
cd workers/senate_data_worker
npx wrangler r2 bucket create senate-data-bucket
```

### 2. Configure Worker Variables

Edit `workers/senate_data_worker/wrangler.toml` to set environment variables:

```toml
[vars]
CONGRESS = "119"        # Current Congress number
SESSION = "1"           # Session number (1 or 2)
TARGET_STATE = "NY"     # Two-letter state code (uppercase)
```

**Note**: These variables are set per-environment. For production, you may want to use `wrangler secret` or environment-specific configs.

### 3. Verify R2 Binding

Ensure `wrangler.toml` includes the R2 bucket binding:

```toml
[[r2_buckets]]
binding = "DATA_BUCKET"
bucket_name = "senate-data-bucket"
```

### 4. Install Dependencies

```bash
cd workers/senate_data_worker
npm install
```

## Development

### Local Development (HTTP Endpoints)

Start the Worker locally to test HTTP endpoints:

```bash
cd workers/senate_data_worker
npm run dev
```

This starts a local server (typically `http://localhost:8787`). You can test endpoints:

```bash
# Health check
curl http://localhost:8787/health

# Latest NY votes (requires data in R2)
curl http://localhost:8787/state/NY/latest.json

# Dated snapshot
curl http://localhost:8787/state/NY/2025-12-18.json

# Metadata
curl http://localhost:8787/state/NY/_meta.json
```

**Note**: Local dev uses a local R2 emulation by default. For testing against a real R2 bucket, use:

```bash
npm run dev -- --remote
```

### Testing Scheduled Ingestion

To test the cron-triggered ingestion locally:

```bash
cd workers/senate_data_worker
npm run test-scheduled
```

This simulates the scheduled handler and will:

1. Compute `cutoff_date_et` (today in US/Eastern)
2. Find `target_vote_date` (most recent voting day < cutoff)
3. Fetch and parse Senate XML for that date
4. Filter to NY senators
5. Publish JSON to R2 (local emulation or remote if `--remote`)

**Expected output**: Logs showing `cutoff_date_et`, `target_vote_date`, vote counts, and R2 publish confirmation.

### Running Tests

Unit tests for parsing, date handling, and storage:

```bash
cd workers/senate_data_worker
npm test
```

Watch mode:

```bash
npm run test:watch
```

### Type Checking

```bash
cd workers/senate_data_worker
npm run check
```

## Deployment

### Deploy to Cloudflare

```bash
cd workers/senate_data_worker
npm run deploy
```

This publishes the Worker to Cloudflare and enables the cron trigger.

### Verify Deployment

After deployment, check:

1. **Health endpoint**:
   ```bash
   curl https://senate-data-worker.<your-subdomain>.workers.dev/health
   ```

2. **Worker logs**:
   ```bash
   npx wrangler tail
   ```

3. **Cron execution**: Wait for the next scheduled run (10:00 UTC daily) or trigger manually via Cloudflare Dashboard → Workers → Triggers → Cron Triggers → "Run now".

### Environment Variables (Production)

If you need to override variables for production:

```bash
# Set secrets (if needed)
npx wrangler secret put CONGRESS
npx wrangler secret put SESSION
npx wrangler secret put TARGET_STATE

# Or use wrangler.toml environments:
# [env.production.vars]
# CONGRESS = "119"
# ...
```

## HTTP API Endpoints

All endpoints return JSON with `Content-Type: application/json` and CORS headers.

### `GET /health`

Health check endpoint (no R2 access required).

**Response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2026-01-04T16:30:00.000Z"
}
```

**Use case**: Deployment validation, monitoring.

### `GET /state/NY/latest.json`

Returns the latest computed vote summary for NY.

**Response** (200 OK): JSON matching the snapshot schema (see `workers/senate_data_worker/SPEC.md`).

**Error** (404 Not Found): If no data exists yet.

**Use case**: Website fetches this to display the most recent voting day.

### `GET /state/NY/YYYY-MM-DD.json`

Returns a dated snapshot (e.g., `/state/NY/2025-12-18.json`).

**Response** (200 OK): JSON matching the snapshot schema.

**Error** (404 Not Found): If the requested date doesn't exist.

**Use case**: Historical lookups, backfill validation.

### `GET /state/NY/_meta.json`

Returns metadata including `target_vote_date`, `generated_at`, and stats.

**Response** (200 OK): JSON matching the `_meta.json` schema (see `workers/senate_data_worker/SPEC.md`).

**Error** (404 Not Found): If no data exists yet.

**Use case**: Website can check `target_vote_date` and `generated_at` without parsing the full `latest.json`.

### Error Responses

All endpoints return consistent error format:

```json
{
  "error": "not_found",
  "message": "Resource not found",
  "path": "/state/NY/2025-12-18.json"
}
```

## Caching & CORS

### CORS Policy

**Default**: `Access-Control-Allow-Origin: *` (allows all origins for MVP).

**Headers included**:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

**OPTIONS preflight**: Returns `204 No Content` with CORS headers.

**Note**: For production, consider restricting to your website's origin via environment variable (see `SPEC.md` for details).

### Cache-Control Strategy

Cache headers balance freshness with CDN efficiency. **Dated snapshots are NOT immutable** (they may be updated by ad-hoc backfills).

| Resource Type          | Cache-Control Header                                 | Rationale                                           |
|------------------------|------------------------------------------------------|-----------------------------------------------------|
| `latest.json`          | `s-maxage=300, stale-while-revalidate=86400`         | Short CDN TTL (5 min), allow stale for 1 day       |
| `_meta.json`           | `s-maxage=300, stale-while-revalidate=86400`         | Same as `latest.json` (metadata changes daily)      |
| Dated snapshots        | `s-maxage=86400, stale-while-revalidate=604800`      | Longer CDN TTL (1 day), stale for 1 week           |
| `/health`              | `s-maxage=60, max-age=0, must-revalidate`            | Short CDN TTL (1 min), no browser cache             |

**Notes**:
- `s-maxage` applies to CDN/shared caches (Cloudflare edge)
- `stale-while-revalidate` allows serving stale content while fetching fresh data in the background
- Dated snapshots get longer TTL but **NOT** `immutable` (ad-hoc backfills may update them)

## Operations

### Monitoring Logs

Stream Worker logs in real-time:

```bash
cd workers/senate_data_worker
npx wrangler tail
```

**What to watch for**:
- `cutoff_date_et` and `target_vote_date` (should satisfy `target_vote_date < cutoff_date_et`)
- Vote counts (`votes_total`, `votes_with_state_members`, `state_member_votes`)
- `partial: true` warnings (indicates some vote XMLs failed)
- Duration (should complete in < 2 minutes typically)

### Cron Schedule

- **Cron expression**: `0 10 * * *` (10:00 UTC daily)
- **ET mapping**: 5 AM EST / 6 AM EDT
- **DST handling**: Automatic (via IANA timezone conversion)

See `workers/senate_data_worker/CRON.md` for details.

### Manual Reruns / Backfills

To manually trigger ingestion (e.g., for backfilling a missed day):

1. **Via Cloudflare Dashboard**:
   - Go to Workers → `senate-data-worker` → Triggers → Cron Triggers
   - Click "Run now" next to the cron trigger

2. **Via Wrangler** (local test):
   ```bash
   npm run test-scheduled
   ```

3. **Backfilling a specific date** (requires code changes):
   - Modify `ingest.ts` to accept a date override
   - Or temporarily adjust `cutoff_date_et` logic
   - Run `npm run test-scheduled` locally, then deploy

**Note**: Manual reruns will overwrite `latest.json` and the corresponding dated snapshot. The Worker always computes `target_vote_date` based on `cutoff_date_et`, so backfilling older dates requires code changes.

### Troubleshooting

**Issue**: `latest.json` returns 404 after deployment.

- **Check**: Has the cron run at least once? (Wait for 10:00 UTC or trigger manually)
- **Check**: R2 bucket binding is correct in `wrangler.toml`
- **Check**: Worker logs for ingestion errors (`npx wrangler tail`)

**Issue**: `target_vote_date == cutoff_date_et` (should never happen).

- **Check**: Date parsing logic (see `src/date-parse.ts`)
- **Check**: `cutoff_date_et` computation (should use US/Eastern timezone)
- **Action**: This indicates a logic bug; check logs and fix

**Issue**: Partial ingestion (`partial: true` in `_meta.json`).

- **Check**: `missing_votes` array in `_meta.json`
- **Check**: Senate XML URLs (may be temporarily unavailable)
- **Action**: Worker will retry on next cron run; manual rerun may help

**Issue**: Worker times out (> 30 seconds).

- **Check**: Number of votes on `target_vote_date` (unusually high?)
- **Check**: Network latency to Senate XML endpoints
- **Action**: Consider batching or increasing Worker timeout limits

### Website Integration Example

Fetch the latest NY votes from your website:

```javascript
// Fetch metadata first to check freshness
const metaResponse = await fetch('https://senate-data-worker.<your-subdomain>.workers.dev/state/NY/_meta.json');
const meta = await metaResponse.json();

console.log(`Last updated: ${meta.generated_at}`);
console.log(`Vote date: ${meta.target_vote_date}`);

// Fetch latest votes
const votesResponse = await fetch('https://senate-data-worker.<your-subdomain>.workers.dev/state/NY/latest.json');
const votes = await votesResponse.json();

// Display votes
votes.votes.forEach(vote => {
  console.log(`Vote ${vote.vote_number}: ${vote.title}`);
  vote.members.forEach(member => {
    console.log(`  ${member.name}: ${member.vote_cast}`);
  });
});
```

**Caching note**: The browser/CDN will cache responses per `Cache-Control` headers. For real-time updates, consider fetching `_meta.json` first to check `generated_at`, then conditionally fetch `latest.json` if stale.

## Project Structure

```
daily_senate_update/
├── web/                          # Frontend app (Vite + React)
│   ├── src/
│   └── README.md
├── workers/
│   └── senate_data_worker/       # Cloudflare Worker
│       ├── src/
│       │   ├── index.ts          # Worker entry (fetch + scheduled handlers)
│       │   ├── ingest.ts         # Ingestion orchestration
│       │   ├── fetch.ts          # Senate XML fetching
│       │   ├── xml.ts            # XML parsing utilities
│       │   ├── date-parse.ts     # Date parsing (robust formats)
│       │   ├── storage.ts        # R2 read/write
│       │   └── types.ts          # TypeScript types
│       ├── wrangler.toml         # Worker configuration
│       ├── SPEC.md               # API specification
│       └── CRON.md               # Cron schedule details
└── README.md                     # This file
```

## Specifications

- **API Specification**: `workers/senate_data_worker/SPEC.md`
- **Cron Schedule**: `workers/senate_data_worker/CRON.md`
- **Validation Guide**: `workers/senate_data_worker/VALIDATION.md` (if present)

## License

[Add your license here]

