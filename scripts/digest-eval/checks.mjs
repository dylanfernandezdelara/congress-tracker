/**
 * Automatic checks for the evals: the worker's pre-store checks (workers/senate_data_worker/src/digest/checks.ts),
 * adapted to the eval's bill files. `flags` lists blocking problems first, then warnings.
 */
import * as worker from '../../workers/senate_data_worker/src/digest/checks.ts'
import { statusLabel, votesText } from './prompts.mjs'

export const { numbersIn, gradeLevel, citedSections } = worker

/** The bill's whole text: single-pass text, or every part joined. */
const fullText = (bill) => [bill.text, ...(bill.parts ?? []).map((p) => p.text)].filter(Boolean).join('\n') || null

export const sectionText = (bill, sections) => worker.sectionText(fullText(bill), sections)

export function checkSummary(summary, bill, { long = false } = {}) {
  if (!summary || typeof summary !== 'object') return { flags: ['no summary'], blocking: ['no summary'], grade: null }
  const checkable = {
    ...summary,
    key_points: (summary.key_points ?? []).map((p) => (typeof p === 'string' ? { text: p, section: null } : { text: p.text, section: p.section ?? null })),
  }
  const result = worker.checkSummary(
    checkable,
    { type: String(bill.type).toUpperCase(), title: bill.title ?? null, crsText: bill.crs?.text ?? null, text: fullText(bill), statusLabel: statusLabel(bill), votesText: votesText(bill) },
    { long }
  )
  return { flags: [...result.blocking, ...result.warnings], blocking: result.blocking, grade: result.grade }
}
