# Share a bill

Expanded bill detail has one Share icon. One tap opens the system share sheet with the bill's headline and `/?bill=` link; where there is no share sheet it copies the link and a `Link copied` pill shows at the bottom. The link's preview card (`/og/bill/<id>.png`) carries the headline, the outcome, and yes/no counts over party-colored bars. Opening the link expands the matching row.

## Sub-features

- `share-one-tap` — the icon at the top of the expanded detail. No sheet or preview of our own opens.
- `share-copy-fallback` — without `navigator.share` the link alone is copied and `Link copied` shows in the Notifications region.
- `share-deeplink` — `/?bill=119-hr-1` expands the energy bill without a click. Old links with `&quote=` open the bill too and the param is dropped.
- `share-card` — `GET /og/bill/119-hr-1.png` renders the card; `/?bill=` HTML from the Worker points `og:image` at it.

## How to get to it (user POV)

- Expand a timeline bill, then tap the share icon near the top of the detail panel.
- Open a shared `/?bill=` URL.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed. Visible energy topic is `House passes a broad energy permitting and production package` (UI strips `(local sample)`). First timeline row is `Sanders introduces a ban on artificial superintelligence`.
- Chamber is `All` and the searchbox is empty.

- **Expand first row (desktop).** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser cdp --method Emulation.setDeviceMetricsOverride --params '{"width":1280,"height":800,"deviceScaleFactor":1,"mobile":false}'` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`. Click the first row: `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "/Sanders introduces a ban on artificial/" --nth 0`. A single **Share** icon sits above **What it does**.
- **Share (desktop, no share sheet).** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Share"`. No dialog opens; `Link copied` appears bottom center and the clipboard holds only the `/?bill=` URL.
- **Proof.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/share-bill/link-copied.png`.
- **Deep link.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path "/?bill=119-hr-1&quote=abcdefabcdefabcd"` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "/Details for House passes a broad energy/"`. The energy row is expanded and the address bar no longer has `quote=`.
- **Card.** After `npm run build:web`, curl the Worker (`127.0.0.1:8788/?bill=119-hr-1`, not Vite) and check `og:image` points at `/og/bill/119-hr-1.png?v=…`; fetch that PNG and look at it.

## Gotchas

- Desktop Chrome in the helper has no `navigator.share`, so the copy fallback is what you see there. On iPhone the system share sheet opens instead; test that on a device.
- OG rewrite is Worker HTML, not Vite. The Vite origin never rewrites `og:*`.
