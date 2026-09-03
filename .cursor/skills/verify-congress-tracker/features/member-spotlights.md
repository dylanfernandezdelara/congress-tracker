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
- Tightness-dot taps open a vote-level defector sheet (`Who broke with their party`), not the member profile.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded isolated feed.
- Viewport 1280×800 so the left rail is mounted.
- Home is `/`.

- **See rail.** Load home. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "Members in Congress"`. House and Senate headings appear inside the region. At least one button `Open profile for Rep. Sample Crossover (local)` or `Open profile for Sen. Sample Crossover (local)` exists.
- **Open profile.** Choose a crossover sample. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Open profile for Rep. Sample Crossover (local)"`. A dialog appears whose accessible name is `Rep. Sample Crossover (local)` (heading in the sheet). Section `Voting behavior` is present.
- **Close profile.** Dismiss. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Close" --exact` (sheet toolbar). The dialog is gone and `Members in Congress` remains.
- **Proof.** Capture rail then open sheet. After the rail wait, run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/member-spotlights/rail.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/member-spotlights/rail.png`. After opening the profile, run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/member-spotlights/profile.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/member-spotlights/profile.png`. The profile pair includes the member name and `Voting behavior`.

## Gotchas

- Live `members-roster` against the default local store cannot hide sample spotlights in a verification run, because verification uses isolated persist-to. Doctor still requires a seeded isolated feed. If you drive a non-verification `npm run dev:worker` after a roster sync, re-run `npm run seed` there separately.
- `Open profile for …` is the accessible name; the visible text is the member name only.
- Seeded `LOCAL:*` members may show `Per-member vote history is not available for this session yet.` That still proves the sheet opened.
- Do not treat a Congress.gov `href` fallback as a passed profile-sheet proof.
- Mobile: the same region exists below the feed; desktop recipes must not be claimed from a 390px run.
