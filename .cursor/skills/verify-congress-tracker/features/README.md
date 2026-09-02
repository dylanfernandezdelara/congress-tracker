# Congress Tracker verification map

This directory is the maintained source for verifying the user-facing behavior of Track Congress. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker launch` so Vite is at `http://127.0.0.1:5173` and the Worker is at `http://127.0.0.1:8787`.
- Launch seeds local D1. Doctor checks feed JSON for `(local sample)`. The UI strips that suffix from bill headlines — drive the visible titles. Do not attach to a server this run did not start.
- Ports 5173 and 8787 are exclusive. Local D1 is one SQLite store. Never start a second stack.
- Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker doctor` and require the three seeded `(local sample)` headlines. A mixed live+sample feed is a warning; wipe `workers/senate_data_worker/.wrangler/state` if exclusivity proofs fail.
- Drive at 1280×800 (the helper's default) so left/right rails mount. Below 1024px those rails move under the feed.
- Put the helper on your command line as `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker` from the repo root.

## Driving conventions

- Start every recipe from `/` with chamber `All` and no search/filters unless the feature says otherwise.
- Prefer ARIA roles and accessible names. Use `[data-feed-row-key]` / `[data-feed-topic]` only when a name is generated.
- Treat every command as literal. Keep quoted names unchanged.
- Run browser actions through `verify-congress-tracker browser`.
- Run API reads through `verify-congress-tracker api GET`.
- Cleanup must not remove `artifacts/verify/<feature>/` proof files.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with heading `Track Congress` visible.
- Filter/search proof includes the URL query or a matching `/feed/latest.json` body.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-congress-tracker` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Feed timeline](./feed-timeline.md) covers home load, expand-in-place bill detail, confirmations, and new laws.
- [Search bills](./search-bills.md) covers searchbox submit, matches, empty state, and clear.
- [Filter feed](./filter-feed.md) covers chamber radios and the Filters panel (state, party, topic, member).
- [Member spotlights](./member-spotlights.md) covers the Members in Congress rail and profile sheet.
- [Theme](./theme.md) covers light/dark toggle and persistence on reload.
