# Share a bill

Expanded bill detail lets a reader share a paste-ready blurb and deep link. Opening that `/?bill=` URL expands the matching row.

## Sub-features

- `share-sheet` opens a preview of title, body, and URL from the top-of-detail Share control.
- `share-copy` copies paste-ready `{headline}\n\n{what_it_does}\n\n{url}` text.
- `share-deeplink` opens `/?bill=119-hr-1` and expands the energy bill without a click.

## How to get to it (user POV)

- Expand a timeline bill, then use **Share** or **Copy link** near the top of the detail panel.
- Open a shared `/?bill=` URL.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed. Visible energy topic is `House passes a broad energy permitting and production package` (UI strips `(local sample)`).
- Viewport is 1280×800.
- Chamber is `All` and the searchbox is empty.

- **Expand row.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`. Click the energy bill: `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "/House passes a broad energy permitting/" --nth 0`. The details region appears. Share and Copy link sit above **What it does**. Seeded H.R. 1 shows `Sponsored by` and `Rep. Sample Loyal`.
- **Open share sheet.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Share"`. A dialog `Share this bill` previews the headline, what-it-does body, and a `bill=119-hr-1` URL.
- **Proof (sheet).** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/share-bill/sheet.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/share-bill/sheet.png`.
- **Deep link.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path "/?bill=119-hr-1"` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "/Details for House passes a broad energy/"`. The energy row is expanded without clicking.
- **Proof (deep link).** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/share-bill/deeplink.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/share-bill/deeplink.png`.

## Gotchas

- Desktop Chrome in the helper often has no `navigator.share`. The Share control still opens the preview sheet; Copy link remains the paste path.
- UI strips `(local sample)` from the bill headline. The preview body still uses the digest `what_it_does` text.
- OG rewrite is Worker HTML, not Vite. Prove rewritten `og:title` with curl against the helper worker (`127.0.0.1:8788/?bill=119-hr-1`) after `web/dist` exists, not against the Vite origin.
