# Vote tightness

The home page shows recent votes on a 50%–100% yea axis (House passage on row 1; Senate bills and nominees on row 2), a House-passed / sitting-in-the-Senate list, and a Text grew mark on feed rows whose newer text added provisions. Dots open a tap/click dialog of vote-level defectors.

## Sub-features

- `tightness-desktop` shows both tightness rows in the desktop right rail.
- `tightness-mobile` stacks both tightness rows short under Chronological timeline; the Senate row stays visible.
- `tightness-defectors` opens a dialog of named defectors from a knife-edge dot tap (not hover-only).
- `senate-waiting` lists House-passed bills still in a Senate committee and is reachable in the mobile secondary stack.
- `text-grew` marks a seeded feed row when `added_provisions` exist.

## How to get to it (user POV)

- Open the helper's web URL after launch (default `http://127.0.0.1:5174/`).
- On desktop (≥1024px), read the right rail `Vote tightness` and `House-passed, sitting in the Senate`.
- On a phone-width viewport, read tightness under `Chronological timeline` and Senate-waiting below the feed.
- Tap or click a tightness dot to open who broke with their party.
- Scan the timeline for `Text grew` on `House passes a federal spending oversight bill`.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded isolated feed. Visible spending topic is `House passes a federal spending oversight bill` (UI strips `(local sample)`).
- Start at 1280×800 so the right rail mounts.
- Chamber is `All` and the searchbox is empty.

- **Desktop rail.** Load home. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`. Wait for `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "Vote tightness"`. Headings `House passage` and `Senate bills & nominees` are both present. Region `House-passed, sitting in the Senate` lists the contracting bill. Capture `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/right-rail-tightness/desktop-rail.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/right-rail-tightness/desktop-rail.png`.
- **Text grew.** Find the spending bill. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "House passes a federal spending oversight bill" --nth 0`. The same row shows chip `Text grew`. Capture `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/right-rail-tightness/text-grew.png`.
- **Phone width (390).** Override the viewport. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser cdp --method Emulation.setDeviceMetricsOverride --params '{"width":390,"height":844,"deviceScaleFactor":2,"mobile":true}'` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and wait for Chronological timeline. There is no `.home-rail--right`. `.home-tightness-mobile` sits under the heading and contains both `[data-tightness-row="house"]` and `[data-tightness-row="senate"]`. Capture `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/right-rail-tightness/mobile-390-tightness.png`.
- **iPhone SE (320).** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser cdp --method Emulation.setDeviceMetricsOverride --params '{"width":320,"height":568,"deviceScaleFactor":2,"mobile":true}'` then reload `/`. Both tightness rows remain visible and unclipped. Capture `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/right-rail-tightness/mobile-320-tightness.png`.
- **Senate-waiting on mobile.** Scroll the secondary stack. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser scroll --role region --name "House-passed, sitting in the Senate"` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "House-passed, sitting in the Senate"`. The contracting bill is listed. Capture `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/right-rail-tightness/mobile-senate-waiting.png`.
- **Tap defectors.** Stay at 390 (or 320). Click the knife-edge House dot. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "/House bill H\\.R\\. 88, 210–208, party-line/"`. A dialog named `H.R. 88` appears with heading `Who broke with their party` and a named defector (`Rep. Sample Crossover (local)`). Capture `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/right-rail-tightness/defectors.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/right-rail-tightness/mobile-defectors.png`.
- **API agrees.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker api GET '/stats/tightness.json'`. `house_passage` includes the 210–208 roll, `senate` is non-empty, and `senate_waiting` includes H.R. 33.

## Gotchas

- Desktop recipes at 1280×800 must not be claimed from a 390/320 run. Reset width with `Emulation.setDeviceMetricsOverride` (`width`: 1280, `height`: 800, `mobile`: false) if you return to the rail.
- Do not hide the Senate tightness row on mobile. Compact stacking is required; hover-only defectors fail this feature.
- `qa:web` mocks `/stats/tightness.json`. That path does not prove this feature.
- UI strips `(local sample)` from bill headlines. Doctor still requires that suffix in feed JSON.
- Vote-level defectors are a dialog (`Who broke with their party`), not the session leaderboard and not a hover tooltip.
