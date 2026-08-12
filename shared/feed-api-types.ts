/** Shared JSON contracts for /feed/* — consumed by worker and web. */

import type { BillProcessSummary } from './bill-process-api-types'
import type { BillTextChanges } from './bill-text-api-types'
import type { BillDigestContent } from './digest-api-types'
import type { ExecutiveSignal, RelatedExecutiveBill } from './executive-api-types'
import type { BillLifecycle } from './lifecycle-api-types'

export type FeedChamber = 'House' | 'Senate'

export interface FeedBill {
  congress: number
  type: string
  number: number
  title: string | null
}

export interface FeedPassageVote {
  chamber: FeedChamber
  /** Always set by the worker feed builder. */
  congress: number
  session: number
  roll_number: number
  question: string
  result: string
  yeas: number
  nays: number
  date: string
}

/**
 * A recorded roll on the bill that is not final passage — the rule, a motion to
 * recommit, an amendment vote. These show what the chamber contested before
 * passage, which final-passage tallies alone cannot convey.
 */
export interface FeedCompanionVote {
  chamber: FeedChamber
  congress: number
  session: number
  roll_number: number
  question: string
  result: string
  yeas: number
  nays: number
  date: string
}

export interface FeedItem {
  bill: FeedBill
  policy_area: string | null
  digest: BillDigestContent | null
  raw_summary_text: string | null
  passage_votes: FeedPassageVote[]
  /** Non-passage rolls on the same bill, newest first. Omitted when empty. */
  companion_votes?: FeedCompanionVote[]
  /**
   * Latest passage-vote date for the bill (vote dates only).
   * Null when the bill is feed-visible via executive signals but has no
   * passage votes loaded.
   */
  latest_passage_date: string | null
  /**
   * Latest feed-sort activity date — max of passage votes and executive
   * signal timestamps. Used for chronology / row ordering, not as a vote date.
   */
  latest_activity_date: string
  lifecycle: BillLifecycle | null
  /**
   * Committee-process timeline + current waiting label when hydrated.
   * Omitted when no committee events are stored for the bill.
   */
  process?: BillProcessSummary | null
  executive_signals?: ExecutiveSignal[]
  related_executive_bills?: RelatedExecutiveBill[]
  /**
   * Set only when the newest bill text adds sections the plain-English summary
   * does not describe, so readers are told when `digest` is incomplete.
   */
  text_changes?: BillTextChanges
}

export interface FeedPageResponse {
  items: FeedItem[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}
