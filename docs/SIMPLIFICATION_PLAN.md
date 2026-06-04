# Congress Tracker — Simplification Plan

> **Purpose of this document.** This is an implementation plan for simplifying the
> Congress Tracker codebase. It is written so that each **Phase** can be handed to a
> separate Composer 2 agent as a self-contained unit of work: one phase ≈ one branch ≈
> one PR. Phases are ordered by dependency and risk (safest, highest-leverage first).
>
> **Audience.** A fresh agent with no prior conversation context. Everything an agent
> needs to execute a phase is in that phase's section.

---

## Background: why we are doing this

This repo is a **solo-developer, public-data app** (Senate vote intelligence) that was
originally built with the operational scaffolding of a multi-engineer production
service: canary rollouts, shadow mode, quality gates, secret-history scanning,
internal-reference allowlists, and several layers of indirection. The **core
architecture is sound** — D1 as the only datastore, a unified Worker (`fetch` +
`scheduled` + `queue`), and an HTTP-replay seam for deterministic tests. What is
overcomplicated is the **ring of machinery around that core**, plus accumulated dead
weight and duplication.

Three things make the repo hard to develop with (for both humans and Cursor agents):

1. **Slow single feedback loop** — `npm run harness:ci` (5–15 min) is the only true
   end-to-end check.
2. **Two very large files** — `congress.ts` (~1,382 lines) and `member-ingest.ts`
   (~1,092 lines) blow context windows and are risky to edit.
3. **Redundant / triplicated systems** — notably **three** parallel "fake data"
   mechanisms and verification surfaces that duplicate CI work.

### Guiding principles

- **Subtract, don't rewrite.** Prefer deleting scaffolding over redesigning the pipeline.
- **One seam per concern.** One datastore, one fake-data mechanism, one schema source,
  one shared payload-type source.
- **Keep `harness:ci` green after every phase.** It is the contract.
- **Preserve behavior** unless a phase explicitly removes a capability (those are called
  out under "Tradeoffs").

### What we are NOT changing

- D1 remains the only datastore. (It is the correct Cloudflare-native choice; local dev
  via miniflare `--persist-to` is already simple.)
- The unified Worker model (`fetch` + `scheduled` + `queue`) stays.
- The HTTP-replay seam in `sources/http-client.ts` stays — it becomes the *only*
  fake-data mechanism (see Phase 2).
- We do **not** read from the production D1 during local/cloud development. Realistic
  local data comes from replay fixtures or an explicit live ingestion into local D1.

---

## Phase overview

| Phase | Title | Risk | Leverage | Depends on |
|------:|-------|------|----------|------------|
| 1 | Zero-risk deletes (dead code, unused deps, shims) | Very low | High | — |
| 2 | Collapse the three fake-data systems into one seam | Medium | Very high | 1 |
| 3 | Consolidate CI & scripts; add a fast inner loop | Low | Very high | 1 |
| 4 | Right-size the synthesis/OpenRouter subsystem | Medium | Medium | 1 |
| 5 | Single source of truth for schema and payload types | Medium | Medium | 1, 2 |
| 6 | Break up the two monster files | Low (behavior) / churny | Medium | 3, 4, 5 |
| 7 | Documentation sweep (`AGENTS.md`, `README`, this plan) | Very low | Medium | all prior |

**Recommended execution order:** 1 → 2 → 3 → 4 → 5 → 6 → 7. Phases 3 and 4 are
independent of each other and of 2 (all only depend on 1), so they can run in parallel
on separate branches if desired. Phase 6 should run last because it is the most
import-churny and benefits from the reduced surface area of earlier phases.

**Per-phase agent checklist (applies to every phase):**

- [ ] Branch from latest `main`: `git checkout -b cursor/<phase-name>-<suffix>`.
- [ ] Make only the changes in scope for the phase.
- [ ] Run the phase's verification commands; ensure they pass.
- [ ] Update any docs invalidated by the change (or defer to Phase 7 if noted).
- [ ] Commit in small, logical commits; push; open a PR with a summary referencing this
      plan and the phase number.

---

## Phase 1 — Zero-risk deletes

**Objective.** Remove dead code, unused dependencies, and pure-indirection re-export
shims. No behavioral change. This shrinks the surface every later phase (and every
future agent) must reason about.

**Why first.** Highest value-per-risk. Smaller surface makes all subsequent phases
easier and reduces context needed.

**Dependencies.** None.

### Scope / steps

1. **Remove unused frontend dependencies.**
   - Delete `d3` and `@types/d3` from `web/package.json` (zero imports in `web/src`).
   - Run `npm --prefix web install` to update the lockfile.
2. **Delete dead frontend code.**
   - `web/src/utils/featureFlags.ts` — zero imports. Delete the file.
   - Remove the unused API-URL override surface: `setApiUrlOverride` /
     `getApiUrlOverride` and the `localStorage.apiUrl` branch in `web/src/api/config.ts`,
     plus their re-exports in `web/src/api/index.ts`. **Keep** `VITE_API_URL` and the
     `http://localhost:8787` default. (If a maintainer confirms they use the localStorage
     override for debugging, keep it and note that in the PR — otherwise remove.)
   - Remove `darkMode: ['class']` from `web/tailwind.config.ts` (no dark styles exist).
3. **Dedupe the frontend error helper.**
   - `normalizeErrorMessage` is duplicated in `web/src/hooks/useBriefingFeed.ts` and
     `web/src/hooks/useVoteDetail.ts`. Extract one copy (e.g. into
     `web/src/api/fetchJson.ts` or a small `web/src/utils/errors.ts`) and import it in
     both hooks.
4. **Collapse worker re-export shims.** For each shim below, repoint its importers at the
   real module and delete the shim file:
   - `workers/senate_data_worker/src/storage.ts` → `storage/index.ts`
   - `workers/senate_data_worker/src/d1/documents.ts` → `storage/documents.ts`
   - `workers/senate_data_worker/src/openrouter.ts` → `synthesis/*`
   - `workers/senate_data_worker/src/analysis-validation.ts` → `synthesis/quality.ts`
   - Verify there are no remaining importers of the deleted paths before deleting.

### Verification

- `npm --prefix web run build`
- `npm --prefix web test`
- `npm --prefix workers/senate_data_worker run check`
- `npm --prefix workers/senate_data_worker test`
- `npm run harness:ci`

### Done criteria

- All verification commands pass.
- No references remain to deleted files/exports (`rg` for each deleted symbol returns
  nothing).
- `web` bundle no longer includes `d3`.

### Tradeoffs / risks

- Essentially none. The only judgment call is the API-URL `localStorage` override — keep
  it only if actively used for debugging.

---

## Phase 2 — Collapse the three fake-data systems into one seam

**Objective.** Make the **HTTP-replay seam** (`FetchConfig.fixture` in
`sources/http-client.ts`) the single mechanism for non-live data. Remove the frontend
fixture system and the duplicate preview Wrangler config. Rename the harness env vars to
honest, intent-revealing names.

**Why.** Today there are three parallel fake-data systems at three layers: the worker
HTTP-replay fixtures, the frontend `e2eData.ts`, and the `wrangler.dev.toml` preview
config. Adding a single briefing field can require editing all three. Consolidating to
one seam is the single biggest "easier to develop" win and removes a whole class of
drift bugs. Everything downstream of the replay seam (ingestion → D1 → read-model → API →
React) then runs the *same code* in dev, CI, and prod.

**Dependencies.** Phase 1 (smaller surface; shims gone).

### Scope / steps

1. **Delete the frontend fixture system.**
   - `web/src/e2eData.ts` (~335 lines)
   - `web/src/utils/e2eMode.ts`, `web/src/hooks/useE2eMode.ts`, `web/src/hooks/useE2eLink.ts`
   - Remove the `E2E_*` branches from `web/src/hooks/useBriefingFeed.ts` and
     `web/src/hooks/useVoteDetail.ts` (hooks always fetch from the worker).
   - Remove the "Review mode" banner / `usingDemo` logic from `web/src/routes/Home.tsx`.
   - Remove `VITE_FORCE_E2E` from `web/src/vite-env.d.ts` and anywhere it is read.
   - **UI/design review path going forward:** run the real worker in replay mode (the
     harness already does this) and point Vite at it via `VITE_API_URL`.
2. **Remove the duplicate preview Wrangler config.**
   - Delete `workers/senate_data_worker/wrangler.dev.toml`.
   - Add an `[env.preview]` section to `workers/senate_data_worker/wrangler.toml` that
     carries the preview/fixture vars previously in `wrangler.dev.toml` (replay mode,
     pinned clock, `ALLOWED_ORIGIN=*`, relaxed freshness). Deploy via
     `wrangler deploy --env preview`.
   - Update `.github/workflows/cloudflare-pages-preview.yml`: it currently builds with
     `VITE_FORCE_E2E=1` and deploys a static fixture frontend. Either (a) repoint it to
     build against a deployed `preview` worker env, or (b) if the zero-backend static
     preview is deemed not worth keeping, remove the workflow. **Decision required from
     maintainer** — see Tradeoffs. Default to (a).
3. **Rename the harness env vars to honest names.** This is a mechanical rename across
   worker source, scripts, and configs:
   - `HARNESS_MODE` (values `fixture`/`live`) → `DATA_SOURCE` (values `replay`/`live`).
   - `HARNESS_NOW` → `CLOCK`.
   - Keep `HARNESS_FIXTURE_SET` but consider renaming to `REPLAY_FIXTURE_SET` for
     consistency.
   - Update: `src/config.ts`, `src/harness.ts`, `src/runtime.ts`, `scripts/harness-ci.sh`,
     `scripts/harness-env.sh`, `wrangler.toml` (`[env.preview]`), and any tests.
   - Preserve the deterministic-clock behavior; this is a rename, not a behavior change.

### Verification

- `npm run harness:ci` (the critical gate — proves the real worker + replay seam still
  drives the frontend deterministically).
- `npm --prefix web run build` and `npm --prefix web test`.
- Manual: `VITE_API_URL=<replay-worker-url> npm --prefix web run dev` renders a briefing.

### Done criteria

- `web/src/e2eData.ts` and the `e2e`/`VITE_FORCE_E2E` machinery no longer exist.
- Only one Wrangler config file remains, with a `preview` environment.
- No references to `HARNESS_MODE`/`HARNESS_NOW` remain (renamed).
- `harness:ci` is green.

### Tradeoffs / risks

- **Lost capability:** the "static frontend preview with no worker at all"
  (`VITE_FORCE_E2E=1` Pages deploy). For a data-driven app this is an acceptable loss;
  the preview can instead run against a deployed replay-mode worker. If the maintainer
  values the zero-backend preview, keep a single thin path for it and document it as the
  *only* exception.
- Rename touches many files; rely on the compiler + `harness:ci` to catch misses.

---

## Phase 3 — Consolidate CI & scripts; add a fast inner loop

**Objective.** Remove duplicated verification work and give agents (and humans) a fast
(~1–2 min) end-to-end signal so the full 5–15 min `harness:ci` is reserved for final
checks.

**Why.** This is the highest-leverage change for *iteration speed*. `public:check`
re-runs the worker/web typecheck and tests that the dedicated CI jobs already run; the
only true E2E loop is slow; and several scripts duplicate shell helpers.

**Dependencies.** Phase 1.

### Scope / steps

1. **Add a fast inner-loop check.**
   - Add a script (e.g. `scripts/harness-quick.sh` and a root `npm run harness:quick`)
     that starts the replay-mode worker, triggers ingestion, and runs **`harness:assert`
     only** (HTTP assertions), skipping the Playwright browser run.
   - Document it in `AGENTS.md` as the fast loop; keep `harness:ci` as the full gate.
2. **De-duplicate CI.**
   - In `.github/workflows/ci.yml`, stop re-running worker/web `check`+`test` inside the
     `public-readiness` job. Make `public-readiness` **scan-only**.
   - Move the heavy secret-history scan (TruffleHog + Python) off every-PR: run it on
     pushes to `main`, on a schedule, and on `workflow_dispatch`. **Keep** the cheap
     `scan-tracked-secrets` on every PR.
3. **De-duplicate shell helpers.**
   - Factor `kill_port` and `wait_for_url` into one sourced helper (e.g.
     `scripts/lib/proc.sh`) used by both `scripts/dev-all.sh` and `scripts/harness-ci.sh`
     (~40 duplicated lines today).
4. **Retire redundant entry points.**
   - Remove the worker `test-scheduled` npm script in favor of `smoke:scheduled`
     (`run-ingest-local.sh`), updating any docs that reference it.

### Verification

- `npm run harness:quick` (new) passes and is materially faster than `harness:ci`.
- `npm run harness:ci` still passes.
- CI workflow YAML is valid (`wrangler deploy --dry-run` where relevant; lint the YAML).
- `npm run public:check` (now scan-only) passes.

### Done criteria

- A documented fast loop exists and is referenced in `AGENTS.md`.
- `public-readiness` no longer duplicates unit/typecheck work.
- Shared shell helpers live in one file.
- `test-scheduled` is gone.

### Tradeoffs / risks

- Moving the history scan off every-PR slightly weakens the "always safe to publish"
  guarantee. Acceptable for an already-public, already-clean repo; the cheap tracked-file
  scan still runs on every PR.

---

## Phase 4 — Right-size the synthesis/OpenRouter subsystem

**Objective.** Reduce the operational toggle surface of the optional LLM-synthesis
subsystem from five knobs to one, moving tuning thresholds into code defaults.

**Why.** Shadow mode, canary percent, max-new-analyses, and hard/soft quality gates are
progressive-rollout tools for a team shipping to many users. For a solo developer they
are pure cognitive overhead (~10 env vars in `.dev.vars`).

**Dependencies.** Phase 1.

### Scope / steps

1. **Collapse the toggles to one switch.**
   - Introduce a single `SYNTHESIS=on|off` (default `off` locally, `on` in prod as
     desired).
   - Remove `OPENROUTER_SHADOW_MODE` and `OPENROUTER_CANARY_PERCENT` from the runtime path
     and from `.dev.vars.example` / `config.ts`. (Synthesis already degrades gracefully on
     failure, so canary/shadow add little at this scale.)
   - Keep `OPENROUTER_MODEL` and `OPENROUTER_API_KEY` (needed to actually call the API)
     and `OPENROUTER_MAX_NEW_ANALYSES` only if a real cost cap is still wanted; otherwise
     fold into a code default.
2. **Move quality/evidence thresholds into `config.ts` defaults.**
   - `QUALITY_MIN_CLAIMS_COVERAGE`, `QUALITY_MIN_QUOTE_VALIDITY`,
     `QUALITY_MAX_CONFIDENCE_MISMATCH`, `QUALITY_HARD_GATES`, `EVIDENCE_MAX_BILLS`,
     `EVIDENCE_BILL_CONCURRENCY`, `EVIDENCE_ENDPOINT_FANOUT`, `ACTIVITY_LOOKBACK_DAYS`
     become defaults in code, overridable by env only when actively tuning.
   - Trim `.dev.vars.example` accordingly (target ≤ ~5 vars for a normal local run).
3. **Update fixture/replay behavior.** Ensure replay-mode runs deterministically with
   synthesis off (today fixture mode forces shadow/skip — keep that behavior under the
   new switch).

### Verification

- `npm run harness:ci` (synthesis off in replay → deterministic).
- Optional, requires real keys: `npm --prefix workers/senate_data_worker run smoke:scheduled`
  with `SYNTHESIS=on` to confirm the live path still works.
- `npm --prefix workers/senate_data_worker run check` and `test`.

### Done criteria

- One `SYNTHESIS` switch governs the subsystem.
- `.dev.vars.example` is trimmed to the essentials.
- Removed env knobs no longer appear in `config.ts`, `.dev.vars.example`, or docs.

### Tradeoffs / risks

- Loses gradual-rollout safety (shadow/canary) for synthesis changes. Mitigation: the
  subsystem already degrades gracefully, and at solo scale the briefing can be eyeballed
  after a run. If a real rollout knob is later needed, reintroduce a single one.

---

## Phase 5 — Single source of truth for schema and payload types

**Objective.** Eliminate the two drift hazards: dual D1 schema definitions, and
hand-mirrored payload types between worker and frontend.

**Why.** The schema exists both as `migrations/*.sql` and as inline `PLATFORM_SCHEMA_SQL`
in `d1/schema.ts` — they have already diverged once (`0006_drop_ghost_tables`). The
frontend `api/types.ts` (~464 lines) hand-mirrors the worker payload with no compiler
link, so an API-shape change is a silent multi-file edit. These are exactly the breakages
agents introduce.

**Dependencies.** Phase 1, Phase 2 (renamed/cleaned data path).

### Scope / steps

1. **One schema source.** Choose one of:
   - **(Preferred)** Derive the local lazy-ensure SQL from the migration files (read the
     migrations and apply them for local), so migrations are the single truth; or
   - Commit fully to `wrangler d1 migrations apply --local` for local dev and delete the
     inline `PLATFORM_SCHEMA_SQL` duplication.
   - Document the chosen approach in `AGENTS.md` and remove the divergence risk.
2. **Share payload types worker → web.**
   - Export the worker's public payload types (`platform-types.ts`) and consume them from
     the frontend instead of the hand-written `web/src/api/types.ts`. Options: a tiny
     shared package, a path import, or a generated `.d.ts`. Pick the lightest that keeps
     `web` and `worker` builds independent enough to not be fragile.
   - Reconcile/merge the worker's `types.ts` (~750) and `platform-types.ts` (~217) where
     they overlap, so there is one canonical payload-type definition.
3. **Remove ghost types.** Delete `ArgumentExcerpt` / `PartyArgumentSummary` (and similar)
   if their tables were dropped and they are no longer rendered. Confirm with `rg` that
   nothing reads them before deleting.

### Verification

- `npm --prefix workers/senate_data_worker run check` and `test`.
- `npm --prefix web run build` (web type-checks against shared types) and `test`.
- `npm run harness:ci`.
- Confirm a fresh local D1 created via the chosen schema path matches a migrated prod
  schema (spot-check table list).

### Done criteria

- Exactly one schema source; no inline/migration divergence.
- Frontend payload types derive from the worker (no duplicate hand-maintained mirror).
- Ghost types removed.

### Tradeoffs / risks

- Sharing types couples web↔worker builds slightly; this is desirable (the current
  decoupling is accidental, not deliberate). Keep the coupling at the type level only.

---

## Phase 6 — Break up the two monster files

**Objective.** Split `congress.ts` (~1,382) and `member-ingest.ts` (~1,092) into focused
modules so they fit comfortably in an editing context window and are safer to change.

**Why.** These are the files most likely to exceed an agent's effective editing window
and cause botched edits. Pure mechanical, behavior-preserving refactor.

**Dependencies.** Phases 3, 4, 5 (reduced surrounding noise; types/synthesis settled so
the split lands on stable interfaces). Do this **last** to minimize import churn against
other in-flight work.

### Scope / steps

1. **Split `congress.ts`** by responsibility, e.g.:
   `congress/members.ts`, `congress/bills.ts`, `congress/crec.ts`,
   `congress/committees.ts`, with a thin `congress/index.ts` barrel preserving the public
   API. Move, don't rewrite.
2. **Split `member-ingest.ts`** similarly along its internal seams (per-member activity
   sources, schedules, roll calls).
3. Update imports across the worker. Keep public function signatures identical.

### Verification

- `npm --prefix workers/senate_data_worker run check` and `test` (the test suite is the
  safety net — it must pass unchanged).
- `npm run harness:ci`.
- Diff review: confirm the change is a pure move (no logic edits) where possible.

### Done criteria

- No single source file exceeds ~600–700 lines without a strong reason.
- Public behavior and the test suite are unchanged.

### Tradeoffs / risks

- Import churn / merge-conflict risk if other phases are still open. Sequence last and
  land quickly. Low behavioral risk because it's a move with tests green.

---

## Phase 7 — Documentation sweep

**Objective.** Bring the docs in line with the simplified system so future agents are not
misled by stale instructions.

**Why.** Stale docs are worse than none for agents — `AGENTS.md` currently documents the
fixture-mode (`/?e2e=1`, `VITE_FORCE_E2E=1`) system that Phase 2 deletes.

**Dependencies.** All prior phases (do as a final sweep, or update incrementally within
each phase and use this as the reconciliation pass).

### Scope / steps

1. **`AGENTS.md`:**
   - Remove the "Frontend fixture review mode" section and any `/?e2e=1` /
     `VITE_FORCE_E2E=1` references (deleted in Phase 2).
   - Document the single replay seam, the `DATA_SOURCE`/`CLOCK` vars, and the new
     `harness:quick` fast loop (Phase 3).
   - Update the env-var list to the trimmed `.dev.vars.example` (Phase 4) and the chosen
     schema workflow (Phase 5).
   - Update the project-structure section for split files (Phase 6).
2. **`README.md`:** reconcile any setup/run instructions changed by Phases 2–4.
3. **This plan:** mark phases complete as they land (or convert to a short CHANGELOG note).

### Verification

- Manual read-through; confirm every command in `AGENTS.md` runs as written on a fresh
  checkout.

### Done criteria

- No doc references a deleted system (`rg` for `e2e`, `VITE_FORCE_E2E`, `HARNESS_MODE`,
  `wrangler.dev.toml`, `test-scheduled` finds only intentional historical notes, if any).

---

## Notes for Composer 2 agents

- **Always keep `npm run harness:ci` green before opening a PR.** It is the contract for
  every phase.
- **One phase per branch/PR.** Name branches `cursor/phase-N-<short-name>-<suffix>`.
- **Do not** point any dev/agent worker's `SENATE_DB` binding at the production
  `database_id`. Use local D1 (`--persist-to`) with replay fixtures, or an explicit local
  `live` ingestion.
- **Do not** commit secrets from `.dev.vars` or local Wrangler state.
- Where a phase says "decision required from maintainer" (Phase 2, the Pages preview),
  default to the documented preferred option and call it out clearly in the PR
  description.
