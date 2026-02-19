# Web Architecture (React + Vite)

## Current Stack

- Framework: React + TypeScript
- Build tool: Vite
- Routing: React Router (`/`, `/about`)
- Data source: Cloudflare Worker JSON endpoints (no direct external API calls from the browser)

## UI Model

The homepage is a deterministic dashboard driven by Worker payloads:

- Featured top senators are read from `GET /activities/index.json` (`featured_senators`)
- Focused senator data comes from `GET /member/{bioguide}/latest.json`
- State vote context comes from `GET /state/{STATE}/latest.json` with snapshot fallback

The UI keeps rendering resilient when some upstream sources are partial:

- Missing context blocks degrade to informative fallback text
- Insight cards render only when deterministic evidence is present
- Partial-source warnings are surfaced without blocking the rest of the page

## Data Contracts

The web app consumes typed contracts in `web/src/api/types.ts`, mirrored from Worker `src/types.ts`.
Important response groups:

- Member index (`/members/index.json`)
- Activity index + featured ranking (`/activities/index.json`)
- Member activity window + deterministic summary (`/member/{bioguide}/latest.json`)
- State vote snapshot (`/state/{STATE}/latest.json`, `/state/{STATE}/_meta.json`)

## Local Development

- Start worker: `npm --prefix workers/senate_data_worker run dev`
- Start web: `npm --prefix web run dev`
- Build web: `npm --prefix web run build`

For deterministic UI screenshots/smoke runs, use the `E2E=1` fixtures.
