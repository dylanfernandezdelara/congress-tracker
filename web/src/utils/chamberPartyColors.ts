/** Party colors for chamber seat rendering — sourced from `--twc-party-*` tokens. */

const PARTY_TOKEN: Record<string, string> = {
  R: '--twc-party-r',
  D: '--twc-party-d',
  I: '--twc-party-i',
  Other: '--twc-party-other',
}

/** CSS color string (`hsl(var(--twc-party-*))`) that follows the active theme. */
export function partySeatColor(code: string): string {
  const token = PARTY_TOKEN[code] ?? PARTY_TOKEN.Other
  return `hsl(var(${token}))`
}
