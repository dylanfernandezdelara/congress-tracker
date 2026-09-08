# Share a bill

Expanded bill detail lets a reader share a paste-ready blurb and deep link. Opening that `/?bill=` URL expands the matching row.

## Sub-features

- `share-sheet` opens from a single iOS-style share icon (square + upward arrow) at the top of the expanded detail. The sheet previews title, body, and URL. Copy lives **inside** the sheet only — there is no competing Copy link control in the row or footer.
- `share-copy` copies paste-ready `{headline}\n\n{what_it_does}\n\n{url}` text from the sheet action.
- `share-deeplink` opens `/?bill=119-hr-1` and expands the energy bill without a click.

## How to get to it (user POV)

- Expand a timeline bill, then tap the share icon near the top of the detail panel.
- Open a shared `/?bill=` URL.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed. Visible energy topic is `House passes a broad energy permitting and production package` (UI strips `(local sample)`). First timeline row is `Sanders introduces a ban on artificial superintelligence`.
- Chamber is `All` and the searchbox is empty.

- **Expand first row (desktop).** Reset the viewport to desktop, then load home. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser cdp --method Emulation.setDeviceMetricsOverride --params '{"width":1280,"height":800,"deviceScaleFactor":1,"mobile":false}'` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`. Click the first timeline row: `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "/Sanders introduces a ban on artificial/" --nth 0`. The details region appears. A single **Share** icon (no **Copy link** in the row) sits above **What it does**.
- **Open share sheet (desktop).** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Share"`. A dialog `Share this bill` is fully on-screen. The first row stays in the viewport (not shoved above the fold). The sheet is a child of `document.body`, not `.feed-row-detail-panel`.
- **Proof (desktop sheet).** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/share-bill/sheet.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/share-bill/after-share-desktop.png`.
- **Open share sheet (390).** Override the viewport. Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser cdp --method Emulation.setDeviceMetricsOverride --params '{"width":390,"height":844,"deviceScaleFactor":2,"mobile":true}'` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`. Expand the first row (`/Sanders introduces a ban on artificial/`), then click **Share**. The sheet and first-row headline stay on-screen.
- **Proof (390 sheet).** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/share-bill/after-share-390.png`.
- **Deep link.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser cdp --method Emulation.setDeviceMetricsOverride --params '{"width":1280,"height":800,"deviceScaleFactor":1,"mobile":false}'` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path "/?bill=119-hr-1"` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "/Details for House passes a broad energy/"`. The energy row is expanded without clicking.
- **Proof (deep link).** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/share-bill/deeplink.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/share-bill/deeplink.png`.

## Gotchas

- Desktop Chrome in the helper often has no `navigator.share`. The icon still opens the preview sheet; **Copy link** inside the sheet is the paste path.
- There is no second Copy link control in the expanded detail or footer.
- UI strips `(local sample)` from the bill headline. The preview body still uses the digest `what_it_does` text.
- OG rewrite is Worker HTML, not Vite. The verify stack serves the UI from Vite on 5174; a placeholder `web/dist` is only enough for wrangler to start. Prove rewritten `og:title` by curling the Worker on `127.0.0.1:8788/?bill=119-hr-1` after a real build (`npm run build:web`), not against the Vite origin.
- `.feed-row-detail-panel` keeps a CSS transform from its enter animation. The sheet **must** portal to `document.body` so `position: fixed` is viewport-relative.
