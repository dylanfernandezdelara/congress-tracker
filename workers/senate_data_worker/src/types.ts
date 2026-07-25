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

/**
 * A recorded roll on a bill that is not a passage vote — a rule, a motion to
 * recommit, an amendment. Persisted so daily House ingest can skip re-fetching
 * the detail, and surfaced as feed "companion votes" because these rolls show
 * what the chamber actually fought over before final passage.
 */
export interface NonPassageVoteStub {
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

export interface IngestVotesResult {
  votes: PassageVote[];
  skipped: number;
  truncated?: boolean;
  warnings?: string[];
  nonPassageStubs?: NonPassageVoteStub[];
}

import type { BillDigestContent } from "../../../shared/digest-api-types";
import type { BillLifecycle } from "../../../shared/lifecycle-api-types";

export type { BillDigestContent, BillLifecycle };

export type {
  FeedBill,
  FeedItem,
  FeedPageResponse,
  FeedPassageVote,
} from "../../../shared/feed-api-types";

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
