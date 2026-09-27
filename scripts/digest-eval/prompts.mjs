/**
 * Digest eval prompts: the worker's own prompt (workers/senate_data_worker/src/digest/prompt.ts), so the evals
 * always test what production sends. Node strips the TypeScript types on import. This file only adapts the eval's
 * bill files (bills/*.json) to the worker's input and returns chat messages.
 */
import * as worker from '../../workers/senate_data_worker/src/digest/prompt.ts'

export const PROMPT_VERSION = worker.PROMPT_VERSION

/** An eval bill file → the worker's DigestBillInput. */
export function toInput(bill, text = bill.text ?? null) {
  return {
    congress: bill.congress,
    type: String(bill.type).toUpperCase(),
    number: bill.number,
    title: bill.title ?? null,
    sponsorName: bill.sponsor?.name ?? null,
    status: bill.status,
    committees: bill.committees ?? [],
    policyArea: bill.policyArea ?? null,
    votes: bill.votes ?? [],
    crs: bill.crs ? { version: bill.crs.version ?? null, text: bill.crs.text } : null,
    textVersion: bill.textVersion ?? null,
    text,
  }
}

const asChat = ({ system, user }) => [
  { role: 'system', content: system },
  { role: 'user', content: user },
]

export const singlePassMessages = (bill) => asChat(worker.singlePassMessages(toInput(bill)))
export const partMessages = (bill, part) => asChat(worker.partMessages(toInput(bill, null), part))
export const combineMessages = (bill, notes) => asChat(worker.combineMessages(toInput(bill, null), notes))
export const statusLabel = (bill) => worker.statusLabel(toInput(bill))
export const votesText = (bill) => worker.votesLine(toInput(bill))
