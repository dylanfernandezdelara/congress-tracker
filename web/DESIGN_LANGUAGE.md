# Web Design Language

Editorial, dense UI inspired by [benji.org](https://benji.org) and [dylanfdl.com](https://www.dylanfdl.com). Simple systems — type, gray hierarchy, and hairline dividers — carry the polish.

## Palette

Three-gray hierarchy on near-white / near-black:

| Role | Light | Dark |
| --- | --- | --- |
| Primary text | `#292929` | `#EDEDED` |
| Secondary text | `#5D5D5D` | `#A6A6A6` |
| Tertiary / faint | `#9E9E9E` | `#6E6E6E` |
| Background | `#FAFAFA` | `#0A0A0A` |
| Card | `#FFFFFF` | `#141414` |
| Hairline border | `#E5E5E5` | `#292929` |

Functional colors (desaturated): pass green, fail red, law amber, party R/D/I. No orange accent.

Tokens live as `--twc-*` HSL channels in `web/src/styles/base.css`.

## Typography

**One family:** system SF Pro stack

```css
-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif
```

- Weights: **400** and **500** only
- Global `letter-spacing: -0.15px`
- Scale (only four sizes): **12px** meta/dates · **13px** body/teasers · **14px** headlines/section titles · **24px** page title
- `tabular-nums` / `font-feature-settings: "tnum"` on tallies and dates

## Radii & icons

- Navigation / toggles: **8px**
- Cards / detail panels: **16px**
- CTA buttons: **pill** (`9999px`)
- Icons: **14px** nav/meta, **20px** in cards

## Layout

- **Desktop (≥1024px):** three-column shell — left rail (Federal Control bars + member spotlights) · dense feed · right rail (pulse + compact notable votes)
- **Mobile:** single-column feed; rails hidden
- Hairline dividers instead of shadows; one soft shadow only on the member profile sheet
- Theme toggle in header; `localStorage.theme` wins over `prefers-color-scheme`

## Components

- **Feed list** — one 16px card containing hairline-divided rows (~72–80px collapsed)
- **Collapsed row** — 14px headline · 12px meta line (outcome colored) · 13px teaser; bullets live in expanded detail
- **Expanded detail** — key points, lifecycle pipeline, vote history, multi-column defectors
- **Federal Control compact** — horizontal seat bars (full wedges remain on `/stats`)

## Rules

- Do not introduce a second typeface
- Do not invent font sizes outside 12 / 13 / 14 / 24
- Prefer gray hierarchy over chip-soup color
- Keep QA selectors (`feed-row`, `data-feed-*`, site-nav, aria-labels) stable
