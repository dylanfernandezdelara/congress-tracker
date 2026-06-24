/** Saturated party colors for chamber seat rendering (3D + amphitheater). */

export const PARTY_SEAT_COLORS: Record<string, string> = {
  R: '#C62828',
  D: '#1565C0',
  I: '#7B1FA2',
  Other: '#757575',
}

export function partySeatColor(code: string): string {
  return PARTY_SEAT_COLORS[code] ?? PARTY_SEAT_COLORS.Other
}
