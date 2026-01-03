# Daily Senate Update CLI Plan (Rust)

## Source availability (confirmed)

- Senate.gov XML sources page: https://www.senate.gov/general/common/generic/XML_Availability.htm
  - Roll call vote list XML (sample): https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_111_2.xml
  - Roll call vote XML (sample): https://www.senate.gov/legislative/LIS/roll_call_votes/vote1112/vote_111_2_00001.xml
  - Floor activity summaries XML (sample): https://www.senate.gov/legislative/LIS/floor_activity/2015/01_20_2015_Senate_Floor.xml
  - Floor schedule XML: https://www.senate.gov/legislative/schedule/floor_schedule.xml
  - Current senators info (includes Bioguide IDs): https://www.senate.gov/legislative/LIS_MEMBER/cvc_member_data.xml
  - Current senators contact list: https://www.senate.gov/general/contact_information/senators_cfm.xml

- Congress.gov API (official, requires api_key): https://api.congress.gov/
  - Swagger UI is accessible; OpenAPI requests without a key return API_KEY_MISSING.
  - Plan to use for member lookup, bill activity, and vote metadata.

- GovInfo API (official, requires api_key): https://api.govinfo.gov/docs/
  - Collections endpoint requires api_key; CREC collection (Congressional Record) is the target for floor debate and remarks.

## Data model

Define a canonical Event:

- id (stable source-specific key)
- type (vote, floor_summary, speech, bill_action, nomination, treaty, schedule)
- senator (bioguide_id + display name)
- timestamp (UTC and local)
- title, summary
- source_url
- metadata (map for source-specific fields)

## CLI scope (MVP)

- `senate-today senators --state CA`
  - Resolve the two senators for a state (using Bioguide IDs).
- `senate-today today --state CA [--date YYYY-MM-DD] [--json]`
  - Aggregate votes + floor summary + other actions into one timeline.
- `senate-today votes --state CA [--date YYYY-MM-DD] [--json]`
  - Show roll call votes and each senator's position.
- `senate-today floor --date YYYY-MM-DD [--json]`
  - Show floor summary (from Senate XML); later add Congressional Record excerpts.

## Data flow

- Resolve senators for the state from Senate XML (Bioguide IDs).
- Determine "today" based on US/Eastern.
- Votes:
  - Use Senate roll call vote list to find vote numbers for the day.
  - Fetch each vote XML, extract each senator's vote.
- Floor summary:
  - Fetch the floor activity XML for the day (if available).
- Other activity (optional in MVP):
  - Use Congress.gov API for bill actions or sponsorships tied to each senator.

## Storage & caching (iteration path)

- Start with no DB: query sources at request time, keep only in-memory results per run.
- Add optional file cache (JSON) keyed by date and source with TTL.
- Upgrade to SQLite for history, faster queries, and offline access.
- Later: move to a server-backed DB + API for shared access and scheduled sync.

## Implementation steps

1. Scaffold Rust CLI (clap) with subcommands and shared config.
2. Config: read `CONGRESS_API_KEY` (and later `GOVINFO_API_KEY`) from env.
3. Implement Senate XML client:
   - `cvc_member_data.xml` -> senator lookup by state.
   - roll call vote list -> vote numbers for a date.
   - roll call vote XML -> per-senator vote.
   - floor activity XML -> daily summary text.
4. Implement Congress.gov client for supplemental activity (bill actions).
5. Build Event aggregation and output (table + `--json`).
6. Add tests for XML parsing using saved fixtures.

## Rust module layout (prototype)

- `src/main.rs` -> CLI entrypoint, parses args, routes to commands.
- `src/cli/` -> subcommands and output formatting (table + json).
- `src/config.rs` -> env config, defaults, validation.
- `src/models/` -> `Event`, `Actor`, join types, and source-specific structs.
- `src/sources/` -> HTTP clients for Senate XML, Congress.gov, GovInfo.
- `src/normalize/` -> map source payloads into canonical `Event`s.
- `src/store/` -> storage boundary trait and implementations.
- `src/util/` -> time helpers (US/Eastern), retry/backoff, cache keys.

## Storage boundary (trait)

- `Store` trait to support iteration without refactors:
  - `put_events(events)` (optional for no-DB; needed for caches/DBs)
  - `get_events(query)` (for local DB / cache reads)
  - `get_or_fetch(query, fetch_fn)` (for cache-backed fetches)
  - `invalidate(keys)` (for cache TTL or explicit refresh)
- Implementations by phase:
  - `InMemoryStore` -> per-run cache, no persistence.
  - `FileCacheStore` -> JSON files keyed by source/date.
  - `SqliteStore` -> normalized events + actors + sources.
