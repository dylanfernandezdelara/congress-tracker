# Share a quote

Selecting text inside an expanded bill's summary opens a small floating menu. **Share quote** stores the passage, then opens the share sheet with a card preview and a `/?bill=…&quote=<id>` link. Opening that link expands the bill, highlights the passage in place, scrolls to it, and shows a `Shared quote` toast.

## Sub-features

- `quote-select-menu` shows a toolbar `Selected text actions` (`Share quote`, `Copy`) when the selection lies inside one quotable region (`What it does`, a `Key points` bullet, or the CRS summary). Selections that span two regions, or land outside them, show nothing.
- `quote-share-sheet` opens dialog `Share this quote` with an HTML twin of the OG card (quote as main text, headline muted below, status line, tally bar or status chip) and the `&quote=` URL.
- `quote-landing` opens `/?bill=119-hr-1&quote=<id>`, expands the bill, highlights the passage (`mark[data-quote-highlight]`), scrolls it into view, and toasts `Shared quote`.
- `quote-landing-callout` falls back to an aside `Shared quote` above the summary when the stored text no longer matches the digest.
- `quote-og` (Worker HTML, not Vite) rewrites `og:description` / `twitter:description` to the quote, points `og:image` / `twitter:image` at `/og/bill/<id>.png?q=<quoteId>&v=…`, and sets `og:image:alt`.

## How to get to it (user POV)

- Expand a timeline bill, select a run of text inside **What it does**, **Key points**, or the CRS summary, then tap **Share quote**.
- Open a shared `/?bill=…&quote=…` URL.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed. Visible energy topic is `House passes a broad energy permitting and production package`.
- Chamber is `All` and the searchbox is empty. Desktop viewport (1280×800).

- **Expand the energy bill.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`, then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "/House passes a broad energy permitting/" --nth 0` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "/Details for House passes a broad energy/"`.
- **Select text in What it does.** Playwright has no drag-select helper, so build the DOM selection: `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser eval --js "(() => { const p = document.querySelector('[data-quotable=\"digest\"]'); const r = document.createRange(); r.setStart(p.firstChild, 0); r.setEnd(p.firstChild, 70); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); document.dispatchEvent(new Event('selectionchange')); return sel.toString(); })()"`. After ~150 ms, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser find --role toolbar --name "Selected text actions"` reports 1 match.
- **Proof (menu).** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/share-quote/selection-menu-desktop.png`.
- **Share quote.** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Share quote"` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role dialog --name "Share this quote"`. The sheet shows the card twin (`.og-card-preview`) with the selected text as the quote and a URL containing `&quote=`.
- **Proof (sheet).** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/share-quote/share-sheet-quote.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/share-quote/share-sheet-quote-desktop.png`. Read the URL with `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser eval --js "document.querySelector('.bill-share-preview-url').textContent"`.
- **Landing.** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path "/?bill=119-hr-1&quote=<id>"` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "/Details for House passes a broad energy/"`. Within ~1 s, `mark[data-quote-highlight]` exists with the quote text, its rect is inside the viewport, and `.app-toast` reads `Shared quote`.
- **Proof (landing).** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/share-quote/landing.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/share-quote/landing-highlight-desktop.png`.
- **Mobile.** Override to 390×844 (SKILL.md **Mobile proof**), repeat landing, select, and share; save `landing-highlight-390.png`, `selection-menu-390.png`, `share-sheet-quote-390.png`.
- **Crawler (Worker, not Vite).** `curl -s -A "Twitterbot/1.0" -H "Accept: text/html" "http://127.0.0.1:8788/?bill=119-hr-1&quote=<id>"` must show `og:description` = the quote and `og:image` ending in `/og/bill/119-hr-1.png?q=<id>&v=…`. `curl -D - -o /tmp/og.png "http://127.0.0.1:8788/og/bill/119-hr-1.png?q=<id>"` returns `image/png` with `x-og-card: rendered` (a `static` value means satori failed and the fallback PNG was served).

## Gotchas

- The menu only appears when the selection starts and ends inside the **same** `[data-quotable]` element. Selecting across `What it does` and a bullet shows nothing by design.
- `selectionchange` fires on a 120 ms settle timer; wait before `find --role toolbar`.
- The verify stack serves the UI from Vite on 5174; the Vite dev proxy forwards `/share` and `/og` to the Worker so `POST /share/quote` works there. OG meta is Worker HTML — curl 8788, not 5174.
- `POST /share/quote` rejects text shorter than 12 or longer than 280 characters, and text that is not a whitespace-normalized substring of the digest / CRS summary / stored bill text. The menu shows the error inline (`quote_too_short`, `quote_not_in_bill`, `rate_limited`).
- Seed party splits do not sum to the seeded tally, so the card preview and PNG show a grey two-tone bar (`Yea 220` / `Nay 213`) instead of party colors. That is the reconciliation rule, not a rendering bug.
- The card twin in the sheet is HTML; the PNG the crawler fetches comes from satori. Compare both when changing card layout.
