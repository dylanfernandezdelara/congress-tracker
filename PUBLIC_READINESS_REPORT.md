# Public Readiness Report

Generated: 2026-02-19

## Scope

This report summarizes repository hardening work completed to prepare `main` for public visibility on GitHub, with emphasis on:
- secret hygiene,
- dependency risk,
- internal reference checks,
- branch/history hygiene.

## Validation Loop Results

`npm run public:check` passed with all gates green:
- tracked-file secret scan passed (`scripts/scan-tracked-secrets.sh`)
- full-history secret scan passed (`scripts/scan-history-secrets.sh`, trufflehog)
- internal/staging URL sweep passed (`scripts/scan-internal-references.sh`)
- worker typecheck/tests passed
- web typecheck/tests passed

## Dependency Audit Results

Audit command used:
- `npm audit --audit-level=high` in root, `workers/senate_data_worker`, and `web`

Current status:
- root: 0 vulnerabilities
- worker: 0 vulnerabilities
- web: 0 vulnerabilities

Notes:
- Root Puppeteer dependency was removed (legacy script cleanup).
- Web dev tooling was updated to patched versions (`vite` and `@vitejs/plugin-react`).

## Secret Hygiene Status

### Tracked Content
- No tracked secrets found by regex scan.
- No secret-like values found in reachable git history via trufflehog scan.

### Local Ignored Files Checklist (manual launch-day confirmation)
- [ ] Rotate any real keys currently present in local ignored files (for example `.env`, `workers/senate_data_worker/.dev.vars`).
- [ ] Confirm `.env` and `.dev.vars` remain ignored by git.
- [ ] Ensure only placeholder values exist in tracked examples/docs.

## Internal / Staging Reference Sweep

- Automated URL sweep passed.
- Current allowlist intentionally includes public docs/test/example hosts (`example.com`, `localhost`, public API/docs domains).
- No non-allowlisted internal/staging hosts remain in production code/docs paths.

## Commit Message Appropriateness Review (Report-Only)

### Outcome
- No profanity, insults, confidential incident details, credentials, or clearly inappropriate commit text was found.

### Low-severity clarity issues (non-blocking)
- `2f4ce5e` — `Add user search`
- `a35cb85` — `Add frontend for search`
- `3973eba` — `Add server API`
- `c603417` — `Add activity feed API`

These are acceptable to keep public; they are just less descriptive than ideal.

## Branch Cleanup Recommendations

Visibility note: all remote branches become visible once the repo is public.

### Recommended delete before public flip (already merged into `origin/main`)
- `origin/01-02-feat_implement_phase_3a_cli_foundation`
- `origin/01-03-feat_implement_phase_3b_output`
- `origin/01-04-feat_implement_phase_3c_senators_cmd`
- `origin/01-05-add_web_interface_for_ny_senators_voting_records`
- `origin/01-05-feat_implement_phase_3d_votes_cmd`
- `origin/01-05-phase_2_xml_parsing_library_date_parsing_with_tests`
- `origin/01-05-post-mvp_cleanup_label_rust_cli_as_validation_tool_and_trim_unrelated_modules`
- `origin/01-06-feat_implement_phase_3e_floor_cmd`
- `origin/01-06-phase_1_scaffold_vite_react_typescript_and_add_react_router`
- `origin/01-07-feat_implement_phase_3f_today_cmd`
- `origin/01-08-feat_implement_phase_3_ingest_orchestration`
- `origin/01-08-phase_2_api_types_and_client`
- `origin/01-09-feat_implement_phase_6_cron_scheduled_handler`
- `origin/01-18-update_web_readme_with_concise_setup_instructions_and_architecture_explanation`
- `origin/01-19-add_senate_schedule_ingestion_and_update_web_ui`
- `origin/graphite-base/14`
- `origin/graphite-base/24`
- `origin/graphite-base/9`
- `origin/member-activity-rollcall-votes`
- `origin/p3-home-ui-parity`
- `origin/p4-styles-extract-modernize`
- `origin/p5-cloudflare-redirects-docs`
- `origin/phase0-specifications`
- `origin/phase1-worker-scaffold`
- `origin/retire-rust-cli`

### Unmerged branches to explicitly decide (delete or archive)
- `origin/01-02-demo_3a8e638c_add_activity_feed_api` (head: `c603417`)
- `origin/01-02-demo_5e974606_add_frontend_for_search` (head: `a35cb85`)
- `origin/01-02-demo_767faee1_add_user_search` (head: `2f4ce5e`)
- `origin/01-02-demo_f01dd1d5_add_server_api` (head: `3973eba`)
- `origin/graphite-base/10` (head: `7e343eb`)
- `origin/graphite-base/15` (head: `546062e`)
- `origin/graphite-base/16` (head: `a5b1423`)
- `origin/graphite-base/7` (head: `498717b`)

## Launch-Day Governance Checklist

- [ ] Enable branch protection on `main` (PR required, required checks, no force push).
- [x] Delete merged remote branches listed above.
- [x] Delete or archive each unmerged branch above.
- [x] Confirm `npm run public:check` still passes on the final pre-launch commit.
- [ ] Rotate local and production API keys if real credentials are present.
- [ ] Verify production `ALLOWED_ORIGIN` is set to deployed frontend origin.
- [ ] Flip repository visibility to public.

## Execution Notes (2026-02-20)

- Branch cleanup completed:
  - Deleted merged branches from the recommended list.
  - Deleted all unmerged demo branches (`origin/01-02-demo_*`) as the explicit decision.
  - Current remotes: `origin/main` only.
- Public readiness gate re-run completed successfully (`npm run public:check`).
- Branch protection could not be changed programmatically in this environment (`gh` branch-protection API returned HTTP 403: `Resource not accessible by integration`), so this remains a manual GitHub settings step.
- Cloudflare secret rotation and production CORS verification remain manual because Wrangler is not authenticated in this environment.
