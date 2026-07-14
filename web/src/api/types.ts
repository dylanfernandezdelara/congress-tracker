import type { BillDigestContent } from '@congress-tracker/shared/digest-api-types'
import type { ExecutiveSignal, RelatedExecutiveBill } from '@congress-tracker/shared/executive-api-types'
import type { BillLifecycle } from '@congress-tracker/shared/lifecycle-api-types'

export type { BillDigestContent, BillLifecycle }

export interface FeedBill {
  congress: number
  type: string
  number: number
  title: string | null
}

export interface FeedPassageVote {
  chamber: 'House' | 'Senate'
  congress?: number
  session?: number
  roll_number?: number
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
  latest_passage_date: string
  lifecycle: BillLifecycle | null
  executive_signals?: ExecutiveSignal[]
  related_executive_bills?: RelatedExecutiveBill[]
}

export type {
  ExecutiveBillLink,
  ExecutiveSignal,
  RelatedExecutiveBill,
} from '../../../shared/executive-api-types'

export interface FeedPageResponse {
  items: FeedItem[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

export type {
  ChamberComposition,
  ChamberPulse,
  ChamberStats,
  CloseVoteEntry,
  DateRange,
  DefectorEntry,
  DefectorsResponse,
  NotableVoteEntry,
  NotableVotesResponse,
  PartySeatCount,
  PortfolioEntry,
  PortfolioMovers,
  PortfoliosResponse,
  PolicyHeatEntry,
  PulseStatsResponse,
  SessionStatsResponse,
  StatsChamber,
  ThisWeekSummary,
  VoteDefectorEntry,
  VoteDefectorsResponse,
} from '../../../shared/stats-api-types'
