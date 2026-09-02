# Member spotlights

Members in Congress shows House and Senate spotlights (cross-party votes and disclosure movers) and opens a profile sheet for a named member.

## Sub-features

- `spotlights-rail` renders region `Members in Congress` with House and Senate kickers.
- `spotlights-open` opens a dialog named for the member from `Open profile for <name>`.
- `spotlights-close` dismisses the sheet with `Close` or the `Close profile` backdrop.

## How to get to it (user POV)

- On desktop (≥1024px), use the left rail `Members in Congress`.
- Below 1024px, scroll under the feed to the same region in the stacked rails.
- Choose a spotlight name button (`Open profile for …`).
- Notable-vote defector names also open the same profile sheet (right rail `Notable votes`).

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed. Seed must not have been followed by a live `members-roster` ingest (that hides `LOCAL:*` spotlights).
- Viewport 1280×800 so the left rail is mounted.
- Home is `/`.

- **See rail.** Load home. Run `verify-congress-tracker browser goto --path /` and `verify-congress-tracker browser wait --role region --name "Members in Congress"`. House and Senate headings appear inside the region. At least one button `Open profile for Rep. Sample Crossover (local)` or `Open profile for Sen. Sample Crossover (local)` exists.
- **Open profile.** Choose a crossover sample. Run `verify-congress-tracker browser click --role button --name "Open profile for Rep. Sample Crossover (local)"`. A dialog appears whose accessible name is `Rep. Sample Crossover (local)` (heading in the sheet). Section `Voting behavior` is present.
- **Close profile.** Dismiss. Run `verify-congress-tracker browser click --role button --name "Close" --exact` (sheet toolbar). The dialog is gone and `Members in Congress` remains.
- **Proof.** Capture rail then open sheet. After the rail wait, `verify-congress-tracker browser snapshot --aria --path artifacts/verify/member-spotlights/rail.aria.txt` and screenshot `artifacts/verify/member-spotlights/rail.png`. After opening the profile, snapshot/screenshot `profile.aria.txt` and `profile.png`. The profile pair includes the member name and `Voting behavior`.

## Gotchas

- After `members-roster` / `member-votes` against local D1, the rail can go empty until `npm run seed` again. Doctor checking feed sample bills is not enough if you skipped seed after a roster sync — relaunch.
- `Open profile for …` is the accessible name; the visible text is the member name only.
- Seeded `LOCAL:*` members may show `Per-member vote history is not available for this session yet.` That still proves the sheet opened.
- Do not treat a Congress.gov `href` fallback as a passed profile-sheet proof.
- Mobile: the same region exists below the feed; desktop recipes must not be claimed from a 390px run.
