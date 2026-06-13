# Web Design Language

Light-mode-only **letterpress poster** aesthetic inspired by [jzhao.xyz](https://jzhao.xyz).

## Palette

- Paper background: `#f5eedd`
- Navy body ink: `#2d4673`
- Deep navy headings: `#16294e`
- Muted metadata: `#9a8e76`
- Vermilion accent (links hover, arrows, separators): `#c8482b`
- Aged-paper borders: `#e3d9c0`

## Typography

Two families only:

- **DM Serif Display** — headlines
- **Bricolage Grotesque** — body, UI, docket lines (use `tabular-nums` for vote tallies)

## Layout

- Single column, max width ~720px, airy vertical rhythm
- Hairline borders; type and whitespace carry hierarchy
- Static dot/halftone texture (CSS), not generative

## Components

- **Feed card** — docket line, serif headline, plain summary, passage vote lines, optional policy tag
- **Flip card** — front = digestible view + congress.gov link; back = official CRS summary
- **Reduced motion** — cross-fade swap instead of 3D flip

## Rules

- No dark mode, no theme toggle
- Vermilion is an ink-stamp accent, not a fill color
- Avoid glassmorphism, heavy shadows, dashboard chrome
