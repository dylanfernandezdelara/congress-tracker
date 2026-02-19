/**
 * API module for fetching Senate voting data.
 *
 * @example
 * ```ts
 * import { fetchLatestNY, getApiBaseUrl } from './api';
 * import type { LatestStateResponse, Vote, VoteMember } from './api';
 *
 * const data = await fetchLatestNY();
 * ```
 */

// Types
export type {
  ActivityIndexEntry,
  ActivityIndexResponse,
  ActivityItem,
  ActivitySource,
  ActivityType,
  AmountEvidence,
  BillAnalysis,
  BillAnalysisClaim,
  BillAnalysisClaimRef,
  BillImpactEvidence,
  BillLawInfo,
  BillRef,
  CommitteeMeetingItem,
  CongressCommitteeMeetingItem,
  DailyDigestItem,
  EvidenceEndpoint,
  EvidenceEndpointStatus,
  EvidenceSourceAvailability,
  FeaturedSenatorEntry,
  FloorScheduleItem,
  GovInfoCrecGranuleHighlightItem,
  InsightEvidence,
  LegislationActionItem,
  MemberDeterministicSummary,
  MemberInsight,
  MemberInsightKind,
  MemberActivityContext,
  MemberActivityResponse,
  MemberIndexEntry,
  MemberIndexResponse,
  OutputMemberVote,
  OutputVote,
  OutputVoteCounts,
  RecipientEvidence,
  HealthResponse,
  RollCallVoteItem,
  SenateRecordArticleItem,
  SenatorSessionStat,
  SessionOverview,
  SourceError,
  StateMetaResponse,
  StateVotesResponse,
  UnknownReason,
  VoteLedger,
  VoteLedgerEntry,
} from './types';

// Config helpers
export {
  getApiBaseUrl,
  getApiUrlOverride,
  setApiUrlOverride,
} from './config';

// API client
export {
  ApiError,
  fetchActivitiesIndex,
  fetchDataHealth,
  fetchMemberLatest,
  fetchMembersIndex,
  fetchHealth,
  fetchSessionOverview,
  fetchStateLatest,
  fetchStateMeta,
  fetchStateSnapshot,
  fetchVoteLedger,
} from './client';
