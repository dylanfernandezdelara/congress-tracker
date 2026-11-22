import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'

/**
 * Astryx theme for trackcongress: the neutral theme with the site's editorial look
 * (web/DESIGN_LANGUAGE.md). Colors point at the app's own `--twc-*` variables, which
 * already switch on `html[data-theme="dark"]`, so Astryx components and the app's own
 * CSS can never drift apart. Rebuild after editing: `npm run theme:build`.
 */
// Light values as fallbacks (web/src/styles/base.css), so the theme still paints if the app CSS has not loaded.
const LIGHT: Record<string, string> = {
  background: '0 0% 98%',
  foreground: '0 0% 16%',
  secondary: '0 0% 36%',
  faint: '0 0% 62%',
  card: '0 0% 100%',
  border: '0 0% 90%',
  'border-hover': '0 0% 80%',
  'surface-subtle': '0 0% 0% / 0.04',
  'surface-secondary': '0 0% 93%',
  skeleton: '0 0% 0% / 0.05',
  'row-hover': '0 0% 0% / 0.03',
  'row-active': '0 0% 0% / 0.05',
  accent: '0 0% 16%',
  pass: '151 40% 36%',
  fail: '0 50% 48%',
  law: '38 63% 36%',
}
const c = (name: string) => `hsl(var(--twc-${name}, ${LIGHT[name]}))`
const SYSTEM_FONT = {
  family: '-apple-system',
  fallbacks: 'BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
}

export const trackcongressTheme = defineTheme({
  name: 'trackcongress',
  extends: neutralTheme,
  typography: {
    scale: { base: 14, ratio: 1.2 },
    body: SYSTEM_FONT,
    heading: SYSTEM_FONT,
  },
  tokens: {
    // Surfaces
    '--color-background-body': c('background'),
    '--color-background-surface': c('card'),
    '--color-background-card': c('card'),
    '--color-background-popover': c('card'),
    '--color-background-muted': c('surface-subtle'),
    '--color-background-inverted': c('foreground'),
    '--color-overlay-hover': c('row-hover'),
    '--color-overlay-pressed': c('row-active'),

    // Text and icons: three grays, no colored accent (DESIGN_LANGUAGE.md: "No orange accent").
    '--color-text-primary': c('foreground'),
    '--color-text-secondary': c('secondary'),
    '--color-text-disabled': c('faint'),
    '--color-text-accent': c('foreground'),
    '--color-icon-primary': c('foreground'),
    '--color-icon-secondary': c('secondary'),
    '--color-icon-disabled': c('faint'),
    '--color-icon-accent': c('foreground'),

    // Accent = ink. Primary buttons and selected controls are near-black (near-white in dark).
    '--color-accent': c('accent'),
    '--color-accent-muted': c('surface-subtle'),
    '--color-on-accent': c('background'),

    // Hairlines
    '--color-border': c('border'),
    '--color-border-emphasized': c('border-hover'),
    '--color-skeleton': c('skeleton'),
    '--color-track': c('border'),

    // Status: the site's desaturated pass / fail / law colors.
    '--color-success': c('pass'),
    '--color-text-success': c('pass'),
    '--color-error': c('fail'),
    '--color-text-error': c('fail'),
    '--color-warning': c('law'),
    '--color-text-warning': c('law'),

    // Info is gray: notices are part of the page, not alerts ("Prefer gray hierarchy over chip-soup color").
    '--color-info': c('foreground'),
    '--color-on-info': c('background'),
    '--color-info-muted': c('surface-secondary'),
    '--color-on-info-muted': c('foreground'),
    '--color-text-info': c('secondary'),
    '--color-icon-info': c('secondary'),
    '--color-border-info': c('border'),

    // Two weights only (400 / 500).
    '--font-weight-semibold': '500',
    '--font-weight-bold': '500',

    // Radii: 8px controls, 16px cards (DESIGN_LANGUAGE.md).
    '--radius-element': '8px',
    '--radius-container': '16px',
  },
})
