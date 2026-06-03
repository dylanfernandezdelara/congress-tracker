/**
 * API module for fetching Senate voting data.
 *
 * @example
 * ```ts
 * import { fetchLatestBriefing, getApiBaseUrl } from './api';
 * import type { BriefingFeedResponse } from './api';
 *
 * const briefing = await fetchLatestBriefing();
 * ```
 */

export type {
  ActivityIndexEntry,
  ActivityIndexResponse,
  AnalysisQuality,
  AmountEvidence,
  BenefitEffect,
  BenefitMapEntry,
  BriefingCrossover,
  BriefingFeedItem,
  BriefingFeedResponse,
  BriefingVoteSummary,
  BillAnalysis,
  BillAnalysisClaim,
  BillAnalysisClaimRef,
  BillImpactEvidence,
  BillLawInfo,
  BillRef,
  EvidenceEndpoint,
  EvidenceEndpointStatus,
  EvidenceSourceAvailability,
  PartyPositionAnalysis,
  PartyStance,
  PartyArgumentSummaryView,
  SourceCoverage,
  VoteCast,
  VoteContentConfidence,
  VoteContentProfile,
  VoteDetailResponse,
  VotePartyBreakdown,
  VoteSourceBasis,
  VoteStatus,
  HistoricalVoteReference,
  ArgumentExcerpt,
} from './types';

export {
  getApiBaseUrl,
  getApiUrlOverride,
  setApiUrlOverride,
} from './config';

export { ApiError, fetchLatestBriefing, fetchVoteDetail } from './client';
