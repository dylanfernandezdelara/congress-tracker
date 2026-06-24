/** Party colors for Three.js — aligned with `--twc-party-*` tokens in styles.css. */

const CSS_VAR_BY_PARTY: Record<string, string> = {
  R: '--twc-party-r',
  D: '--twc-party-d',
  I: '--twc-party-i',
  Other: '--twc-party-other',
}

const FALLBACK: Record<string, string> = {
  R: '#c0392b',
  D: '#2563b0',
  I: '#8b6cad',
  Other: '#9ca3af',
}

function cssPartyColor(code: string): string | null {
  if (typeof document === 'undefined') return null
  const varName = CSS_VAR_BY_PARTY[code] ?? CSS_VAR_BY_PARTY.Other
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!raw) return null
  return `hsl(${raw})`
}

export function partyColor(code: string, _dark = false): string {
  return cssPartyColor(code) ?? FALLBACK[code] ?? FALLBACK.Other
}
