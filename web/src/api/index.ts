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
  AnalysisQuality,
  AmountEvidence,
  BenefitEffect,
  BenefitMapEntry,
  BriefingCrossover,
  BriefingFeedItem,
  BriefingFeedResponse,
  BriefingRankingReason,
  BriefingVoteSummary,
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
  LikelyReason,
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
  PartyPositionAnalysis,
  PartyStance,
  PartyArgumentSummaryView,
  RecipientEvidence,
  SponsorPartySignal,
  SourceCoverage,
  HealthResponse,
  RollCallVoteItem,
  SenateRecordArticleItem,
  SenatorSessionStat,
  SessionOverview,
  SourceError,
  StateMetaResponse,
  StateVotesResponse,
  UnknownReason,
  VoteCast,
  VoteDetailResponse,
  VoteLedger,
  VoteLedgerEntry,
  VotePartyBreakdown,
  VoteStatus,
  HistoricalVoteReference,
  ArgumentExcerpt,
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
  fetchLatestBriefing,
  fetchMemberLatest,
  fetchMembersIndex,
  fetchHealth,
  fetchSessionOverview,
  fetchStateLatest,
  fetchStateMeta,
  fetchStateSnapshot,
  fetchVoteDetail,
  fetchVoteLedger,
} from './client';
