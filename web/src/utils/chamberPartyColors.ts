/** Saturated party colors for chamber seat rendering (3D + amphitheater). */

export const PARTY_SEAT_COLORS_LIGHT: Record<string, string> = {
  R: '#C62828',
  D: '#1565C0',
  I: '#7B1FA2',
  Other: '#757575',
}

export const PARTY_SEAT_COLORS_DARK: Record<string, string> = {
  R: '#EF5350',
  D: '#42A5F5',
  I: '#AB47BC',
  Other: '#9E9E9E',
}

export function partySeatColor(code: string, theme: 'light' | 'dark' = 'light'): string {
  const palette = theme === 'dark' ? PARTY_SEAT_COLORS_DARK : PARTY_SEAT_COLORS_LIGHT
  return palette[code] ?? palette.Other
}
