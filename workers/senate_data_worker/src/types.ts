export type Chamber = "House" | "Senate";

export interface BillRef {
  congress: number;
  type: string;
  number: number;
}

export interface PassageVote {
  chamber: Chamber;
  congress: number;
  session: number;
  rollNumber: number;
  bill: BillRef;
  question: string;
  result: string;
  yeas: number;
  nays: number;
  voteDate: string;
}

/** Persisted so daily House ingest can skip re-fetching non-passage roll details. */
export interface NonPassageVoteStub {
  chamber: Chamber;
  congress: number;
  session: number;
  rollNumber: number;
  bill: BillRef;
  result: string;
  voteDate: string;
}

export interface IngestVotesResult {
  votes: PassageVote[];
  skipped: number;
  truncated?: boolean;
  warnings?: string[];
  nonPassageStubs?: NonPassageVoteStub[];
}

import type { BillDigestContent } from "../../../shared/digest-api-types";
import type {
  ExecutiveSignal,
  RelatedExecutiveBill,
} from "../../../shared/executive-api-types";
import type { BillLifecycle } from "../../../shared/lifecycle-api-types";

export type { BillDigestContent, BillLifecycle };

export interface FeedBill {
  congress: number;
  type: string;
  number: number;
  title: string | null;
}

export interface FeedPassageVote {
  chamber: Chamber;
  congress?: number;
  session?: number;
  roll_number?: number;
  question: string;
  result: string;
  yeas: number;
  nays: number;
  date: string;
}

export interface FeedItem {
  bill: FeedBill;
  policy_area: string | null;
  digest: BillDigestContent | null;
  raw_summary_text: string | null;
  passage_votes: FeedPassageVote[];
  latest_passage_date: string;
  lifecycle: BillLifecycle | null;
  executive_signals?: ExecutiveSignal[];
  related_executive_bills?: RelatedExecutiveBill[];
}

export interface FeedPageResponse {
  items: FeedItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export type {
  ChamberPulse,
  ChamberStats,
  CloseVoteEntry,
  DateRange,
  DefectorEntry,
  DefectorsResponse,
  VoteDefectorEntry,
  VoteDefectorsResponse,
  PortfolioEntry,
  PortfolioMovers,
  PortfoliosResponse,
  PolicyHeatEntry,
  PulseStatsResponse,
  NotableVoteEntry,
  NotableVotesResponse,
  MemberProfileRecentCrossVote,
  MemberProfileResponse,
  PartySeatCount,
  ChamberComposition,
  SessionStatsResponse,
  StatsChamber,
  ThisWeekSummary,
} from "../../../shared/stats-api-types";

export interface MemberRecord {
  bioguideId: string;
  name: string;
  chamber: Chamber;
  party: string | null;
  state: string | null;
  district: number | null;
}

export interface MemberVoteRecord {
  chamber: Chamber;
  congress: number;
  session: number;
  rollNumber: number;
  bioguideId: string;
  position: string;
}
