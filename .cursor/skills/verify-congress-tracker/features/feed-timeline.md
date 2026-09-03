# Feed timeline

The chronological timeline lists recent passage votes with plain-English headlines, lets a user expand a row for digest and vote history, and shows recent confirmations and new laws on the same home page.

## Sub-features

- `timeline-load` shows seeded passage rows under heading `Chronological timeline`.
- `timeline-expand` opens in-place detail for a bill (What it does, Key points, Vote history).
- `timeline-collapse` closes that detail.
- `timeline-confirmations` lists recent Senate confirmations below the feed.
- `timeline-laws` lists new laws below the feed.

## How to get to it (user POV)

- Open the helper's web URL (default `http://127.0.0.1:5174/`) after launch.
- Open a bill deep link `/?bill=119-hr-1` to scroll to that row.
- Scroll below the timeline to `Recent confirmations` and `New laws`.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed. Visible energy topic is `House passes a broad energy permitting and production package` (UI strips `(local sample)`).
- Viewport is 1280×800.
- Chamber is `All` and the searchbox is empty.

- **Open home.** Load the feed. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`. Heading `Track Congress` is visible and the page count text includes `passage vote`.
- **Wait for sample row.** Wait for the energy bill. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "House passes a broad energy permitting and production package" --nth 0`. The row also shows House / H.R. 1 chips. The same title also appears under `New laws` — always target `--nth 0` for the timeline.
- **API agrees.** Read the same feed the UI uses. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker api GET '/feed/latest.json?limit=50&offset=0'`. The JSON `items` include three `(local sample)` digest headlines; the visible headings omit that suffix.
- **Expand row.** Open the energy bill. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "/House passes a broad energy permitting/" --nth 0`. A region named `Details for House passes a broad energy permitting and production package` appears with heading `What it does` and list `Key points`. The toggle reports `aria-expanded=true`.
- **Collapse row.** Click the same toggle again. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "/House passes a broad energy permitting/" --nth 0`. The details region is gone and the collapsed teaser is visible again.
- **Confirmations.** Scroll the main column. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "Recent confirmations"`. The region includes `Jane Doe confirmed as Energy Secretary (local sample)`.
- **New laws.** Wait for laws. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "New laws"`. At least one law row is listed (seeded public-law actions on the sample bills).
- **Deep link.** Open the energy bill by query. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path "/?bill=119-hr-1"` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "/Details for House passes a broad energy/"`. The energy row is expanded without clicking.
- **Proof.** Capture loaded home (collapsed) and expanded detail. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/feed-timeline/home.aria.txt`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/feed-timeline/home.png`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "/House passes a broad energy permitting/" --nth 0`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/feed-timeline/expanded.aria.txt`, and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/feed-timeline/expanded.png`. Both identify Track Congress; the expanded pair includes `What it does`.

## Gotchas

- Rails (`Members in Congress`, `Vote tightness`) are beside the feed only at ≥1024px. A 390px run still has the timeline; tightness stacks under the heading and Senate-waiting is in the secondary stack.
- `npm run qa:web` intercepts feed JSON with a fake "Sample Act". That path does not prove this feature.
- Feed lookback is 45 days. Seed dates are relative to today; do not assert calendar dates from an old screenshot.
- Expand is a toggle on the row button, not a navigation. Proof is the details region on the same URL (except `?bill=`).
- Worker `/health` may be `degraded` with no ingest cron. Empty feed is a seed/D1 problem, not a health-status problem.
- Quote `api GET` paths in zsh (`'/feed/latest.json?limit=50&offset=0'`) so `?` is not globbed.
