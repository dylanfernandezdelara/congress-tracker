import type { CSSProperties } from 'react'

/** Congress.gov CRS policy areas → distinct hues (0–360). */
const POLICY_AREA_HUES: Record<string, number> = {
  'Agriculture and Food': 88,
  Animals: 42,
  'Armed Forces and National Security': 220,
  'Arts, Culture, Religion': 300,
  'Civil Rights and Liberties, Minority Issues': 330,
  Commerce: 260,
  Congress: 0,
  'Crime and Law Enforcement': 8,
  'Economics and Public Finance': 200,
  Education: 275,
  'Emergency Management': 18,
  Energy: 38,
  'Environmental Protection': 145,
  Families: 340,
  'Finance and Financial Sector': 205,
  'Foreign Trade and International Finance': 195,
  'Government Operations and Politics': 215,
  Health: 168,
  'Housing and Community Development': 25,
  Immigration: 15,
  'International Affairs': 230,
  'Labor and Employment': 32,
  Law: 250,
  'Native Americans': 28,
  'Public Lands and Natural Resources': 130,
  'Science, Technology, Communications': 265,
  'Social Sciences and History': 285,
  'Social Welfare': 310,
  'Sports and Recreation': 175,
  Taxation: 48,
  'Transportation and Public Works': 240,
  'Water Resources Development': 190,
  Defense: 220,
  Procedural: 0,
  Uncategorized: 0,
}

function hashHue(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

export function policyAreaHue(label: string | null | undefined): number {
  if (!label) return 0
  const exact = POLICY_AREA_HUES[label]
  if (exact !== undefined) return exact

  const lower = label.toLowerCase()
  if (lower.includes('energy')) return 38
  if (lower.includes('environment')) return 145
  if (lower.includes('health')) return 168
  if (lower.includes('defense') || lower.includes('armed forces') || lower.includes('security')) {
    return 220
  }
  if (lower.includes('transport')) return 240
  if (lower.includes('finance') || lower.includes('economic')) return 200
  if (lower.includes('education')) return 275
  if (lower.includes('immigration')) return 15
  if (lower.includes('crime') || lower.includes('law enforcement')) return 8
  if (lower.includes('agriculture') || lower.includes('food')) return 88
  if (lower.includes('procedural')) return 0

  return hashHue(label)
}

export function policyAreaChipStyle(label: string | null | undefined): CSSProperties {
  return { '--policy-h': `${policyAreaHue(label)}` } as CSSProperties
}

export function policyAreaChipClass(label: string | null | undefined): string {
  const base = 'policy-chip'
  if (!label) return `${base} policy-chip-neutral`
  if (label === 'Procedural' || label === 'Uncategorized') return `${base} policy-chip-neutral`
  return base
}
