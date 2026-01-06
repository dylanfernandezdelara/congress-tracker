# Validation Strategy

This document describes validation steps to ensure the Worker produces correct output that matches the Rust CLI oracle.

## Overview

Validation occurs at multiple levels:
1. **Local smoke tests**: Basic functionality checks using `wrangler dev`
2. **Scheduled ingestion tests**: End-to-end ingestion using `wrangler dev --test-scheduled`
3. **HTTP endpoint validation**: Verify JSON responses and headers
4. **Oracle comparison**: Compare Worker output with Rust CLI output for a fixed date

## Prerequisites

- Node.js and npm installed
- Rust toolchain installed (`cargo`)
- Cloudflare R2 bucket created and bound in `wrangler.toml`
- Worker dependencies installed: `cd workers/senate_data_worker && npm install`

## 1. Local Smoke Steps

### 1.1 Start Worker in Development Mode

Start the Worker locally to test HTTP endpoints:

```bash
cd workers/senate_data_worker
npx wrangler dev
```

The Worker will start on `http://localhost:8787` (or the port shown in output).

### 1.2 Test Health Endpoint

In another terminal, test the health endpoint:

```bash
curl -i http://localhost:8787/health
```

**Expected response:**
- Status: `200 OK`
- Content-Type: `application/json`
- Body: `{"status":"ok","timestamp":"..."}`

### 1.3 Test HTTP Endpoints (After Ingestion)

After running ingestion (see section 2), test the data endpoints:

```bash
# Test latest.json endpoint
curl -i http://localhost:8787/state/NY/latest.json

# Test _meta.json endpoint
curl -i http://localhost:8787/state/NY/_meta.json

# Test dated snapshot endpoint (replace DATE with actual date)
curl -i http://localhost:8787/state/NY/2025-12-18.json

# Test 404 for non-existent snapshot
curl -i http://localhost:8787/state/NY/2020-01-01.json
```

**Expected responses:**
- Status: `200 OK` for existing resources, `404 Not Found` for missing snapshots
- Content-Type: `application/json`
- CORS headers: `Access-Control-Allow-Origin: *`
- Cache-Control headers:
  - `latest.json`: `s-maxage=300, stale-while-revalidate=86400`
  - `_meta.json`: `s-maxage=300, stale-while-revalidate=86400`
  - dated snapshots: `s-maxage=86400, stale-while-revalidate=604800`

**Validate JSON structure:**
- `latest.json` and dated snapshots should match `SnapshotJson` schema (see `src/types.ts`)
- `_meta.json` should match `MetaJson` schema
- All dates should be in `YYYY-MM-DD` format
- `generated_at` should be ISO 8601 timestamps

## 2. Scheduled Ingestion Test

### 2.1 Run Scheduled Handler Locally

Test the full ingestion pipeline using Wrangler's test-scheduled feature:

```bash
cd workers/senate_data_worker
npx wrangler dev --test-scheduled
```

This will:
1. Trigger the `scheduled` handler
2. Fetch vote menu XML
3. Compute target vote date (most recent voting day before today ET)
4. Fetch vote detail XMLs for that date
5. Filter to NY senators
6. Publish to R2 (snapshot, latest, meta)

### 2.2 Verify Logs

Check the console output for:

**Configuration validation:**
```
[scheduled] Configuration validated:
[scheduled]   - Congress: 119
[scheduled]   - Session: 1
[scheduled]   - Target state: NY
```

**Date computation:**
```
[scheduled] TARGET VOTE DATE: 2025-12-18
[scheduled] Cutoff date (ET): 2025-01-XX
```

**Invariant check:** `target_vote_date` must be strictly `< cutoff_date_et`

**Completion summary:**
```
[scheduled] Scheduled ingestion COMPLETE
[scheduled]   - Target date: 2025-12-18
[scheduled]   - Votes processed: X
[scheduled]   - Votes with NY members: Y
[scheduled]   - State member votes: Z
```

### 2.3 Verify R2 Objects

After ingestion completes, verify all three objects exist:

```bash
# Using wrangler R2 commands (if available)
npx wrangler r2 object list DATA_BUCKET --prefix state/NY/

# Or verify via HTTP endpoints (see section 1.3)
```

**Expected objects:**
- `state/NY/latest.json`
- `state/NY/2025-12-18.json` (or computed target date)
- `state/NY/_meta.json`

**Verify publish ordering:** Logs should show "write snapshot" before "write latest/meta"

## 3. Rust Oracle Comparison

Compare Worker output with Rust CLI output for a fixed date to validate correctness.

### 3.1 Generate Rust CLI Output

Run the Rust CLI for a fixed date (e.g., 2025-12-18):

```bash
cd /Users/dylanfdl/Projects/daily_senate_update
cargo run -- votes --state NY --date 2025-12-18 --json > rust_output.json
```

This produces a JSON array of `Event` objects filtered to NY senators.

### 3.2 Generate Worker Output

After running ingestion for the same date, fetch the Worker output:

```bash
# If testing locally
curl http://localhost:8787/state/NY/2025-12-18.json > worker_output.json

# If testing deployed worker
curl https://your-worker.your-subdomain.workers.dev/state/NY/2025-12-18.json > worker_output.json
```

### 3.3 Compare Outputs

The Rust CLI and Worker use different output schemas, so comparison requires normalization:

**Rust CLI format (`Event[]`):**
- Array of events
- Each event has `senator_votes: Option<Vec<SenatorVote>>`
- Vote numbers in `id` field (e.g., `"vote-119-1-00123"`)

**Worker format (`SnapshotJson`):**
- Single object with `votes: OutputVote[]`
- Each vote has `members: OutputMember[]` (NY senators only)
- Vote numbers in `vote_number: number`

**Key fields to compare:**

1. **Vote numbers:** Should match exactly
   ```bash
   # Extract vote numbers from Rust output
   jq -r '.[] | select(.event_type == "vote") | .id | match("vote-\\d+-\\d+-(\\d+)") | .captures[0].string' rust_output.json | sort -n
   
   # Extract vote numbers from Worker output
   jq -r '.votes[].vote_number' worker_output.json | sort -n
   ```

2. **NY senator votes:** For each vote, compare `vote_cast` values
   ```bash
   # Rust: Extract senator votes per vote
   jq '[.[] | select(.event_type == "vote") | {vote_id: .id, senators: .senator_votes[] | {name, vote_cast: .position}}]' rust_output.json
   
   # Worker: Extract member votes per vote
   jq '[.votes[] | {vote_number, members: .members[] | {name, vote_cast}}]' worker_output.json
   ```

3. **Vote counts:** Compare `yeas`, `nays`, `present`, `not_voting`
   ```bash
   # Rust
   jq '[.[] | select(.event_type == "vote") | {id, counts: .vote_result}]' rust_output.json
   
   # Worker
   jq '[.votes[] | {vote_number, counts}]' worker_output.json
   ```

### 3.4 Use Diff Script (Optional)

A helper script is provided to automate comparison (see `scripts/compare-outputs.sh`):

```bash
./scripts/compare-outputs.sh rust_output.json worker_output.json
```

This script:
- Normalizes both outputs to a common format
- Compares vote numbers
- Compares NY senator votes per vote
- Reports discrepancies

## 4. Validation Checklist

Use this checklist for each validation run:

### Local Development
- [ ] `npx wrangler dev` starts without errors
- [ ] `GET /health` returns `200` with valid JSON
- [ ] Health endpoint has correct headers (Content-Type, CORS)

### Scheduled Ingestion
- [ ] `npx wrangler dev --test-scheduled` completes successfully
- [ ] Logs show correct configuration (Congress, Session, State)
- [ ] `target_vote_date < cutoff_date_et` invariant holds
- [ ] All three R2 objects exist after ingestion
- [ ] Publish ordering: snapshot → latest → meta

### HTTP Endpoints
- [ ] `GET /state/NY/latest.json` returns `200` with valid `SnapshotJson`
- [ ] `GET /state/NY/_meta.json` returns `200` with valid `MetaJson`
- [ ] `GET /state/NY/{DATE}.json` returns `200` for existing snapshots
- [ ] `GET /state/NY/{DATE}.json` returns `404` for missing snapshots
- [ ] All endpoints have correct CORS headers
- [ ] Cache-Control headers match spec (no `immutable`)

### Oracle Comparison
- [ ] Rust CLI runs successfully for test date (e.g., 2025-12-18)
- [ ] Worker produces output for same date
- [ ] Vote numbers match between Rust and Worker
- [ ] NY senator `vote_cast` values match for each vote
- [ ] Vote counts (`yeas`, `nays`, etc.) match

### Data Quality
- [ ] `_meta.json.target_vote_date` matches snapshot date
- [ ] `_meta.json.keys.snapshot` matches actual snapshot key
- [ ] Each vote in snapshot has exactly 2 NY senators (unless data indicates otherwise)
- [ ] All dates are in `YYYY-MM-DD` format
- [ ] All timestamps are valid ISO 8601

## 5. Troubleshooting

### Worker fails to start
- Check `wrangler.toml` configuration
- Verify R2 bucket exists and binding is correct
- Check environment variables (`CONGRESS`, `SESSION`, `TARGET_STATE`)

### Scheduled ingestion fails
- Check network connectivity (Worker needs to fetch Senate XML)
- Verify Congress/Session values match available data
- Check logs for XML parsing errors
- Verify date computation logic (ET timezone handling)

### HTTP endpoints return 404
- Ensure ingestion has run successfully
- Check R2 bucket contents: `npx wrangler r2 object list DATA_BUCKET --prefix state/NY/`
- Verify key naming matches expected patterns

### Oracle comparison shows mismatches
- Check date normalization (both should use same date)
- Verify state filtering (both should filter to NY)
- Check vote number extraction logic
- Compare raw XML if needed to identify parsing differences

## 6. Continuous Validation

For CI/CD integration:

```bash
# Run unit tests
npm test

# Run scheduled ingestion test
npx wrangler dev --test-scheduled

# Validate endpoints (requires ingestion to have run)
./scripts/validate-endpoints.sh

# Compare with Rust oracle
./scripts/compare-outputs.sh rust_output.json worker_output.json
```

