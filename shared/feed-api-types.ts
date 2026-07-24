/** Shared JSON contracts for /feed/* — consumed by worker and web. */

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

export interface FeedItem {
  bill: FeedBill
  policy_area: string | null
  digest: BillDigestContent | null
  raw_summary_text: string | null
  passage_votes: FeedPassageVote[]
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
  executive_signals?: ExecutiveSignal[]
  related_executive_bills?: RelatedExecutiveBill[]
}

export interface FeedPageResponse {
  items: FeedItem[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}
