# Senate Data Worker — Specifications (v1)

This document defines the contracts for the Cloudflare Worker that ingests Senate roll-call vote data, computes state-specific summaries, and publishes precomputed JSON to R2.

---

## JSON Schema (v1)

### 1. `latest.json` / `YYYY-MM-DD.json` (snapshot)

**Purpose**: Contains all votes from the computed `target_vote_date` with member votes filtered to the target state (NY for MVP).

**Structure**:

```json
{
  "state": "NY",
  "vote_date": "2025-12-18",
  "generated_at": "2026-01-04T16:30:00.000Z",
  "congress": 119,
  "session": 1,
  "votes": [
    {
      "vote_number": 312,
      "title": "On the Motion to Table S.Amdt. 3456 to H.R. 8998 (Tax Relief Act)",
      "question": "On the Motion to Table",
      "result": "Motion to Table Agreed to",
      "issue": "H.R. 8998",
      "counts": {
        "yeas": 52,
        "nays": 48,
        "present": 0,
        "absent": 0
      },
      "members": [
        {
          "name": "Gillibrand (D-NY)",
          "state": "NY",
          "party": "D",
          "vote_cast": "Yea"
        },
        {
          "name": "Schumer (D-NY)",
          "state": "NY",
          "party": "D",
          "vote_cast": "Yea"
        }
      ]
    }
  ]
}
```

**Field definitions**:

- `state` (string): Two-letter state code (uppercase)
- `vote_date` (string): ISO date (`YYYY-MM-DD`) representing the Senate vote date for this dataset
- `generated_at` (string): ISO 8601 timestamp with milliseconds and `Z` timezone
- `congress` (integer): Congress number (e.g., 119)
- `session` (integer): Session number (1 or 2)
- `votes` (array): List of votes from `vote_date` that include at least one member from `state`
  - `vote_number` (integer): Senate roll call vote number
  - `title` (string): Human-friendly vote description (fallback chain: `vote_title` → `title` → `question + issue`)
  - `question` (string): Vote question (e.g., "On the Motion to Table", "On Passage of the Bill")
  - `result` (string): Vote outcome (e.g., "Motion to Table Agreed to", "Bill Passed")
  - `issue` (string, optional): Bill/document reference (e.g., "H.R. 8998", "S. 1234")
  - `issue_type` (string, optional): One of `bill`, `nomination`, `treaty`, `other`
  - `bill` (object, optional): Enriched bill metadata when `issue_type == "bill"`
    - `congress` (integer): Congress number
    - `type` (string): Bill type (e.g., "S", "H.R.", "S. Res.")
    - `number` (string): Bill number
    - `title` (string, optional): Bill title
    - `url` (string, optional): Congress.gov bill URL
    - `summary` (string, optional): Official Congress.gov summary text (latest available)
    - `summary_date` (string, optional): Date of the summary (`YYYY-MM-DD`)
    - `policy_area` (string, optional): Policy area name
    - `subjects` (array, optional): Legislative subjects list
    - `committees` (array, optional): Committees of referral (name/chamber/id)
    - `introduced_date` (string, optional): Introduced date (`YYYY-MM-DD`)
    - `latest_action` (object, optional): Latest action text/date
  - `counts` (object): Vote tallies
    - `yeas` (integer): Yea votes
    - `nays` (integer): Nay votes
    - `present` (integer): Present votes
    - `absent` (integer): Absent/Not Voting count
  - `members` (array): Member votes filtered to `state == "NY"` (case-insensitive match)
    - `name` (string): Senator name as it appears in XML (e.g., "Gillibrand (D-NY)")
    - `state` (string): Two-letter state code (uppercase)
    - `party` (string): Party affiliation (R, D, I, etc.)
    - `vote_cast` (string): Vote position ("Yea", "Nay", "Present", "Not Voting")

**Notes**:

- `latest.json` and dated snapshots share the same schema.
- If a vote has no members from the target state, it is excluded from the `votes` array.
- Field name fallbacks handle XML variations (see parsing approach in main plan).

---

### 2. `_meta.json`

**Purpose**: Lightweight metadata file for website UI and debugging. Tells consumers what date `latest.json` represents, when it was generated, and basic stats.

**Structure**:

```json
{
  "state": "NY",
  "congress": 119,
  "session": 1,
  "generated_at": "2026-01-04T16:30:00.000Z",
  "cutoff_date_et": "2026-01-04",
  "target_vote_date": "2025-12-18",
  "keys": {
    "latest": "state/NY/latest.json",
    "snapshot": "state/NY/2025-12-18.json"
  },
  "stats": {
    "votes_total": 8,
    "votes_with_state_members": 8,
    "state_member_votes": 16
  },
  "partial": false,
  "missing_votes": []
}
```

**Field definitions**:

- `state` (string): Target state code
- `congress` (integer): Congress number
- `session` (integer): Session number
- `generated_at` (string): ISO 8601 timestamp (when the ingestion ran)
- `cutoff_date_et` (string): ISO date (`YYYY-MM-DD`) representing "today" in US/Eastern (the date the cron considered as "now")
- `target_vote_date` (string): ISO date (`YYYY-MM-DD`) representing the computed vote date (guaranteed `< cutoff_date_et`)
- `keys` (object): R2 key references
  - `latest` (string): R2 key for `latest.json`
  - `snapshot` (string): R2 key for the dated snapshot
- `stats` (object): Ingestion statistics
  - `votes_total` (integer): Total votes found on `target_vote_date`
  - `votes_with_state_members` (integer): Votes that included at least one member from `state`
  - `state_member_votes` (integer): Total individual member vote records from `state` across all votes
- `partial` (boolean): `true` if some vote detail XMLs failed to fetch/parse; `false` if all succeeded
- `missing_votes` (array of integers): Vote numbers that failed to fetch/parse (empty if `partial == false`)

**Invariants**:

- `target_vote_date < cutoff_date_et` (always strictly less than)
- `votes_with_state_members <= votes_total`
- If `partial == true`, `missing_votes.length > 0`

---

## HTTP API

**Purpose**: Serve precomputed JSON from R2 to website clients.

All endpoints return JSON with appropriate headers (see Cache & CORS section).

### Endpoints

| Method | Path                         | Description                                  |
|--------|------------------------------|----------------------------------------------|
| GET    | `/health`                    | Health check (no R2 access required)         |
| GET    | `/state/NY/latest.json`      | Latest computed vote summary for NY          |
| GET    | `/state/NY/YYYY-MM-DD.json`  | Dated snapshot (e.g., `/state/NY/2025-12-18.json`) |
| GET    | `/state/NY/_meta.json`       | Metadata for NY (includes `target_vote_date`) |

### `/health`

**Response** (200 OK):

```json
{
  "status": "ok",
  "timestamp": "2026-01-04T16:30:00.000Z"
}
```

**Notes**:

- Does NOT access R2; always returns 200 if the worker is running.
- Used for deployment validation and monitoring.

### `/state/NY/latest.json`

**Response** (200 OK):

- Body: JSON matching the snapshot schema (see above)
- Headers: `Content-Type: application/json`, CORS, short-TTL cache (see Cache & CORS section)

**Error** (404 Not Found):

```json
{
  "error": "not_found",
  "message": "Resource not found",
  "path": "/state/NY/latest.json"
}
```

### `/state/NY/YYYY-MM-DD.json`

**Response** (200 OK):

- Body: JSON matching the snapshot schema
- Headers: `Content-Type: application/json`, CORS, longer-TTL cache (see Cache & CORS section)

**Error** (404 Not Found):

```json
{
  "error": "not_found",
  "message": "Resource not found",
  "path": "/state/NY/2025-12-18.json"
}
```

**Notes**:

- If the requested date does not exist in R2, return 404.
- Dated snapshots may be overwritten by ad-hoc backfills, so cache headers do NOT include `immutable`.

### `/state/NY/_meta.json`

**Response** (200 OK):

- Body: JSON matching the `_meta.json` schema (see above)
- Headers: `Content-Type: application/json`, CORS, short-TTL cache (see Cache & CORS section)

**Error** (404 Not Found):

```json
{
  "error": "not_found",
  "message": "Resource not found",
  "path": "/state/NY/_meta.json"
}
```

---

## Cache & CORS

### CORS Policy

**Strategy**:

- **Default**: `Access-Control-Allow-Origin: *` (allow all origins for MVP)
- **Optional (environment-restricted)**: If `ALLOWED_ORIGIN` environment variable is set, restrict to that origin:
  - `Access-Control-Allow-Origin: <ALLOWED_ORIGIN>`
  - Include `Vary: Origin` header when origin is not `*` (to ensure correct cache behavior)

**Headers for all JSON responses**:

- `Access-Control-Allow-Origin: *` (or restricted origin if configured)
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
- `Vary: Origin` (only if origin is restricted, i.e., not `*`)

**OPTIONS preflight**:

- Return `204 No Content` with CORS headers listed above
- No body

### Cache-Control Strategy

**Principle**: Balance freshness with CDN efficiency. Do NOT use `immutable` since dated snapshots may be updated by backfills.

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
- All responses include `Content-Type: application/json`

**Example response headers**:

```
Content-Type: application/json
Access-Control-Allow-Origin: *
Cache-Control: s-maxage=300, stale-while-revalidate=86400
```

---

## Example Payloads

### Example `latest.json` / snapshot (realistic multi-vote day)

```json
{
  "state": "NY",
  "vote_date": "2025-12-18",
  "generated_at": "2026-01-04T16:30:00.000Z",
  "congress": 119,
  "session": 1,
  "votes": [
    {
      "vote_number": 310,
      "title": "On the Cloture Motion S. 5241",
      "question": "On the Cloture Motion",
      "result": "Cloture Motion Agreed to",
      "issue": "S. 5241",
      "counts": {
        "yeas": 68,
        "nays": 32,
        "present": 0,
        "absent": 0
      },
      "members": [
        {
          "name": "Gillibrand (D-NY)",
          "state": "NY",
          "party": "D",
          "vote_cast": "Yea"
        },
        {
          "name": "Schumer (D-NY)",
          "state": "NY",
          "party": "D",
          "vote_cast": "Yea"
        }
      ]
    },
    {
      "vote_number": 311,
      "title": "On Passage of the Bill S. 5241",
      "question": "On Passage of the Bill",
      "result": "Bill Passed",
      "issue": "S. 5241",
      "counts": {
        "yeas": 71,
        "nays": 29,
        "present": 0,
        "absent": 0
      },
      "members": [
        {
          "name": "Gillibrand (D-NY)",
          "state": "NY",
          "party": "D",
          "vote_cast": "Yea"
        },
        {
          "name": "Schumer (D-NY)",
          "state": "NY",
          "party": "D",
          "vote_cast": "Yea"
        }
      ]
    },
    {
      "vote_number": 312,
      "title": "On the Motion to Table S.Amdt. 3456 to H.R. 8998",
      "question": "On the Motion to Table",
      "result": "Motion to Table Agreed to",
      "issue": "H.R. 8998",
      "counts": {
        "yeas": 52,
        "nays": 48,
        "present": 0,
        "absent": 0
      },
      "members": [
        {
          "name": "Gillibrand (D-NY)",
          "state": "NY",
          "party": "D",
          "vote_cast": "Yea"
        },
        {
          "name": "Schumer (D-NY)",
          "state": "NY",
          "party": "D",
          "vote_cast": "Nay"
        }
      ]
    }
  ]
}
```

### Example `_meta.json`

```json
{
  "state": "NY",
  "congress": 119,
  "session": 1,
  "generated_at": "2026-01-04T16:30:00.000Z",
  "cutoff_date_et": "2026-01-04",
  "target_vote_date": "2025-12-18",
  "keys": {
    "latest": "state/NY/latest.json",
    "snapshot": "state/NY/2025-12-18.json"
  },
  "stats": {
    "votes_total": 8,
    "votes_with_state_members": 8,
    "state_member_votes": 16
  },
  "partial": false,
  "missing_votes": []
}
```

### Example 404 Error Response

```json
{
  "error": "not_found",
  "message": "Resource not found",
  "path": "/state/NY/2025-11-15.json"
}
```

---

## Summary

This v1 specification defines:

1. **JSON schemas** for `latest.json`, dated snapshots, and `_meta.json` with example payloads
2. **HTTP API endpoints** (`/health`, `/state/NY/latest.json`, `/state/NY/YYYY-MM-DD.json`, `/state/NY/_meta.json`)
3. **404 error format** with `error`, `message`, and `path` fields
4. **CORS strategy** (default `*`, optionally env-restricted with `Vary: Origin`)
5. **Cache-Control values** for each resource type (explicitly **no `immutable`** for dated snapshots)

See `CRON.md` for cron schedule specification.

---

# Member Activity Specification (v2)

This section defines the per-member daily activity feeds (all current U.S. Senators).

## JSON Schema (v2)

### 1. `members/index.json`

**Purpose**: List all current Senators (used to populate the web UI selector).

**Structure**:

```json
{
  "congress": 119,
  "generated_at": "2026-01-04T16:30:00.000Z",
  "members": [
    {
      "bioguide_id": "S000148",
      "name": "Schumer, Charles E.",
      "party": "D",
      "state": "NY",
      "chamber": "Senate",
      "url": "https://www.congress.gov/member/charles-schumer/S000148"
    }
  ]
}
```

### 2. `member/{bioguide}/latest.json` / `member/{bioguide}/{YYYY-MM-DD}.json`

**Purpose**: Per-member daily activity for a rolling 7-day ET window `[start_date, end_date]` covering today and the previous 6 days.

**Structure**:

```json
{
  "member": {
    "bioguide_id": "S000148",
    "name": "Schumer, Charles E.",
    "party": "D",
    "state": "NY",
    "chamber": "Senate",
    "url": "https://www.congress.gov/member/charles-schumer/S000148"
  },
  "congress": 119,
  "generated_at": "2026-01-04T16:30:00.000Z",
  "window": {
    "start_date": "2025-12-29",
    "end_date": "2026-01-04"
  },
  "activities": [
    {
      "source": "congress",
      "type": "legislation_action",
      "role": "sponsor",
      "action_date": "2026-01-03",
      "action_text": "Referred to the Committee on Finance.",
      "activity_id": "S000148:congress:legislation_action:sponsor:2026-01-03:119-s-1234",
      "bill": {
        "congress": 119,
        "type": "S",
        "number": "1234",
        "title": "Tax Relief Act",
        "url": "https://www.congress.gov/bill/119th-congress/senate-bill/1234"
      }
    },
    {
      "source": "senate",
      "type": "roll_call_vote",
      "vote_number": 12,
      "vote_date": "2026-01-03",
      "title": "On the Motion to Invoke Cloture",
      "question": "Cloture Motion",
      "result": "Agreed to",
      "vote_cast": "Yea",
      "activity_id": "S000148:senate:roll_call_vote:2026-01-03:12",
      "bill": {
        "congress": 119,
        "type": "S",
        "number": "1234"
      },
      "url": "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00012.xml",
      "topics": ["Taxation", "Finance"]
    }
  ],
  "context": {
    "floor_schedule": [
      {
        "source": "senate",
        "type": "floor_schedule",
        "date": "2026-01-04",
        "time": "10:00 AM",
        "title": "Morning Business",
        "summary": "Executive nominations and legislative business."
      }
    ],
    "committee_meetings": [
      {
        "source": "senate",
        "type": "committee_meeting",
        "date": "2026-01-04",
        "time": "02:00 PM",
        "committee": "Judiciary",
        "title": "Oversight hearing on DOJ operations",
        "location": "SD-226"
      }
    ],
    "daily_digest": [
      {
        "source": "govinfo",
        "type": "daily_digest",
        "date": "2026-01-03",
        "title": "Congressional Record Daily Digest",
        "url": "https://api.govinfo.gov/...",
        "senate_section_url": "https://api.govinfo.gov/...",
        "summary": "Senate considered ..."
      }
    ]
  },
  "partial": false,
  "errors": []
}
```

**Bill enrichment**: `activities[].bill` can include the same optional enrichment fields described in the vote schema (`summary`, `policy_area`, `subjects`, `committees`, `introduced_date`, `latest_action`).

**Optional fields**:

- `activities[].activity_id` is a stable identifier for the member-specific activity (useful for de-duplication).
- `activities[].topics` is an optional list of topical tags derived from bill metadata (policy area, subjects, committees).

**Notes**:

- `latest.json` and dated snapshots share the same schema.
- `context` is chamber-level information shared across all members for the day (floor schedule, committee meetings, daily digest).
- `partial` is `true` when one or more sources failed; `errors` records source failures.

---

### 3. `activities/index.json` (optional)

**Purpose**: A compact activity ledger that lists unique activities and the Senator IDs associated with each activity. Useful for building trending/graph features without touching the frontend.

**Structure**:

```json
{
  "generated_at": "2026-01-04T16:30:00.000Z",
  "window": {
    "start_date": "2025-12-29",
    "end_date": "2026-01-04"
  },
  "activities": [
    {
      "activity_id": "senate:roll_call_vote:2026-01-03:12",
      "source": "senate",
      "type": "roll_call_vote",
      "date": "2026-01-03",
      "title": "On the Motion to Invoke Cloture",
      "members": ["S000148", "M000639"]
    }
  ]
}
```

## HTTP API (v2)

| Method | Path                                   | Description                                  |
|--------|----------------------------------------|----------------------------------------------|
| GET    | `/members/index.json`                  | List all current Senators                     |
| GET    | `/member/{bioguide}/latest.json`       | Latest activity window for a senator         |
| GET    | `/member/{bioguide}/{YYYY-MM-DD}.json` | Dated snapshot for a senator                 |
| GET    | `/activities/index.json`               | Activity ledger (optional)                    |

Cache and CORS headers follow the same rules as v1 (`latest` and `index` use short TTL, dated snapshots use longer TTL).
