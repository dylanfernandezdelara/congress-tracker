import type { BillTextChanges } from '../api/types'
import { formatCoverageDate } from './billLabels'

/**
 * Congress.gov version labels are accurate but read like filing codes. Map the
 * common ones to plain English; unknown labels fall through unchanged so a new
 * upstream value degrades to something still correct.
 */
const VERSION_PHRASES: Record<string, string> = {
  'introduced in house': 'as introduced',
  'introduced in senate': 'as introduced',
  'reported in house': 'reported by committee',
  'reported in senate': 'reported by committee',
  'engrossed in house': 'passed by the House',
  'engrossed in senate': 'passed by the Senate',
  'engrossed amendment house': 'passed by the House',
  'engrossed amendment senate': 'passed by the Senate',
  'referred in house': 'received in the House',
  'referred in senate': 'received in the Senate',
  'received in senate': 'received in the Senate',
  'placed on calendar senate': 'placed on the Senate calendar',
  'enrolled bill': 'sent to the President',
  'public law': 'enacted as law',
}

export function billVersionPhrase(version: string | null): string {
  if (!version) return 'an earlier version'
  return VERSION_PHRASES[version.trim().toLowerCase()] ?? version
}

/** `Sec. 3` for `3.`, and `Sec. 303A` for `303A.`. */
export function formatProvisionLabel(label: string): string {
  const trimmed = label.replace(/[.\s]+$/, '').trim()
  return trimmed ? `Sec. ${trimmed}` : 'New section'
}

/**
 * One sentence explaining why the plain-English summary is incomplete: which
 * version it describes, and which newer version added text.
 */
export function billTextChangesExplanation(changes: BillTextChanges): string {
  const summaryPhrase = billVersionPhrase(changes.summary_version)
  const latestPhrase = billVersionPhrase(changes.latest_version)
  // Versions can be a year or more apart, so these dates carry the year.
  const latestDate = formatCoverageDate(changes.latest_version_date)
  const summaryDate = changes.summary_version_date
    ? ` (${formatCoverageDate(changes.summary_version_date)})`
    : ''
  return (
    `The summary above describes this bill ${summaryPhrase}${summaryDate}.` +
    ` The text ${latestPhrase} on ${latestDate} also contains:`
  )
}
