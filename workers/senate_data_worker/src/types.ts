import type { BillDigestContent } from "../../../shared/digest-api-types";
import type { BillLifecycle } from "../../../shared/lifecycle-api-types";
import type { NominationRef } from "./sources/nomination-ref";

export type { NominationRef };
export type { BillDigestContent, BillLifecycle };

export type Chamber = "House" | "Senate";

export interface BillRef {
  congress: number;
  type: string;
  number: number;
}

/** Primary (or future cosponsor) sponsor row persisted for state filtering. */
export interface BillSponsorRecord {
  bioguideId: string;
  state: string;
  fullName: string | null;
  party: string | null;
  /** Primary sponsor when true; reserved for future cosponsor support. */
  isPrimary: boolean;
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

/** Senate advise-and-consent confirmation roll (presidential nomination). */
export interface ConfirmationVote {
  chamber: "Senate";
  congress: number;
  session: number;
  rollNumber: number;
  nomination: NominationRef;
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
  /**
   * Latest listed/menu passage or companion-stub date in the lookback
   * (`YYYY-MM-DD`), including rolls this run skipped as already stored.
   * Nomination confirmations do not stamp this field.
   */
  sourceLatestDate?: string;
  /**
   * Latest date among rolls this run skipped as known or persisted as a
   * passage vote / companion stub. Confirmation rolls are ingested separately
   * and do not stamp this field. When this lags `sourceLatestDate`, ingest
   * missed the newest listed passage or companion roll.
   */
  coveredLatestDate?: string;
}

/** Senate ingest also surfaces nomination confirmation rolls (House never does). */
export interface SenateIngestVotesResult extends IngestVotesResult {
  confirmationVotes: ConfirmationVote[];
}

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
  SenateWaitingBill,
  TightnessDot,
  TightnessKind,
  TightnessStatsResponse,
  VoteCohesion,
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

export type {
  RecentLawItem,
  RecentLawsResponse,
} from "../../../shared/laws-api-types";

export type {
  ConfirmationBackgroundContent,
  ConfirmationNominee,
  RecentConfirmationItem,
  RecentConfirmationsResponse,
} from "../../../shared/confirmations-api-types";

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
