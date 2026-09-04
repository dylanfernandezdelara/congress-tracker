# Introduced bills

The chronological timeline lists recently filed Congress.gov introductions with an **Introduced** status — not “No vote recorded” — so a bill that has a number but no passage vote is still findable.

## Sub-features

- `intro-row` shows a seeded intro-only Senate bill with an Introduced chip, sponsor, and headline.
- `intro-search` finds that bill by title token.
- `intro-deeplink` opens `/?bill=119-s-9901` and expands the row.

## How to get to it (user POV)

- Open the helper’s web URL after launch (default `http://127.0.0.1:5174/`).
- Search `superintelligence` in `Search bills`.
- Open `/?bill=119-s-9901`.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed. The ASI fixture headline is `Sanders introduces a ban on artificial superintelligence` (UI strips `(local sample)`).
- Viewport starts at 1280×800.
- Chamber is `All` and the searchbox is empty.

- **Open home.** Load the feed. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Sanders introduces a ban on artificial superintelligence"`. The row shows an `Introduced` chip, `S. 9901`, and `Sen. Bernard Sanders (local)`. It does not show `No vote recorded`.
- **API agrees.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker api GET '/feed/latest.json?limit=50&offset=0'`. One item has `bill.number` 9901, `passage_votes: []`, `lifecycle.introduced_date` set, and a digest headline containing `Ban Artificial Superintelligence` or `superintelligence`.
- **Search.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser fill --role searchbox --name "Search bills" --value "superintelligence"`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser press --key Enter`, and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Sanders introduces a ban on artificial superintelligence"`. URL contains `q=superintelligence`.
- **Deep link.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path "/?bill=119-s-9901"` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "/Details for Sanders introduces a ban/"`. The ASI row is expanded.
- **Desktop proof.** After the home step, run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/introduced-bills/desktop.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/introduced-bills/desktop.png`.
- **Mobile proof.** Override the viewport. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser cdp --method Emulation.setDeviceMetricsOverride --params '{"width":390,"height":844,"deviceScaleFactor":2,"mobile":true}'` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Sanders introduces a ban on artificial superintelligence"`. Capture `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/introduced-bills/mobile.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/introduced-bills/mobile.png`.

## Gotchas

- UI strips `(local sample)` from the bill headline. Doctor still requires that suffix in feed JSON.
- The live Sanders/Casar ASI Act is unfiled as of 2026-09-03; this fixture proves the path once Congress.gov assigns a number.
- Chamber `Senate` should still show this intro (originating chamber). Chamber `House` should hide it.
