import type {
  BillDigestContent,
  GameBillRef,
  GamePartySplit,
  GamePassageVote,
  GameRevealResponse,
  GameRound,
  GameRoundPrompt,
  GameRoundsResponse,
} from '@congress-tracker/shared/game-api-types'

export type {
  BillDigestContent,
  GameBillRef,
  GamePartySplit,
  GamePassageVote,
  GameRevealResponse,
  GameRound,
  GameRoundPrompt,
  GameRoundsResponse,
}

export interface FeedBill {
  congress: number
  type: string
  number: number
  title: string | null
}

export interface FeedPassageVote {
  chamber: 'House' | 'Senate'
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
}

export interface FeedPageResponse {
  items: FeedItem[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

export type {
  ChamberPulse,
  ChamberStats,
  CloseVoteEntry,
  DateRange,
  DefectorEntry,
  DefectorsResponse,
  PortfolioEntry,
  PortfolioMovers,
  PortfoliosResponse,
  PolicyHeatEntry,
  PulseStatsResponse,
  SessionStatsResponse,
  StatsChamber,
  ThisWeekSummary,
} from '../../../shared/stats-api-types'
