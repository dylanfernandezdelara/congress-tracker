/**
 * Member ingestion configuration types and defaults.
 */

import type { FixtureHttp } from "../harness";
import type {
  ActivityIndexJson,
  MemberActivityContext,
  MemberActivityJson,
  MemberIndexJson,
  SourceError,
} from "../types";
import type { VoteSummary } from "../xml";
import type { FetchConfig } from "../fetch";

export interface MemberIngestConfig {
  congress: number;
  session: number;
  congressApiKey: string;
  govInfoApiKey: string;
  lookbackDays?: number;
  /** Reference instant for the Eastern-time window end (injected via Runtime.clock). */
  now?: Date;
  /** Harness fixture transport applied to every fetch this stage performs. */
  fixture?: FixtureHttp;
  /**
   * Pre-fetched vote menu: array when available, `null` when fetch was attempted and
   * failed (do not refetch), `undefined` to fetch inside member vote activities.
   */
  menuVotes?: VoteSummary[] | null;
}

export interface MemberIngestResult {
  success: boolean;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  membersIndex: MemberIndexJson | null;
  memberActivities: MemberActivityJson[];
  activityIndex: ActivityIndexJson | null;
  context: MemberActivityContext;
  errors: SourceError[];
  error?: string;
}

export const DEFAULT_WINDOW_DAYS = 30;
export const MIN_WINDOW_DAYS = 7;
export const MAX_WINDOW_DAYS = 120;

export const DEFAULT_FETCH_CONFIG: FetchConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeoutMs: 15000,
  concurrency: 5,
};