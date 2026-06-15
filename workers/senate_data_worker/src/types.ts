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

export interface IngestVotesResult {
  votes: PassageVote[];
  skipped: number;
}

export interface BillDigestContent {
  headline: string;
  what_it_does: string;
  key_points: string[];
  terms_explained: Array<{ term: string; plain: string }>;
}

export interface FeedBill {
  congress: number;
  type: string;
  number: number;
  title: string | null;
}

export interface FeedPassageVote {
  chamber: Chamber;
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
