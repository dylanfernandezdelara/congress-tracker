/**
 * TypeScript types for the Senate Data Worker API responses.
 *
 * Shared payload shapes are imported from the worker contract; web-only aliases
 * preserve the public type names exported from `./api`.
 */

export type {
  ActivityIndexEntry,
  ActivitySource,
  ActivityType,
  ActivityWindow,
  AmountEvidence,
  AnalysisQuality,
  ArgumentExcerpt,
  ArgumentSourceType,
  BenefitEffect,
  BenefitMapEntry,
  BillAnalysis,
  BillAnalysisClaim,
  BillAnalysisClaimRef,
  BillCommittee,
  BillImpactEvidence,
  BillLatestAction,
  BillLawInfo,
  BillRef,
  BriefingCrossover,
  BriefingFeedItem,
  BriefingFeedResponse,
  BriefingVoteSummary,
  EvidenceEndpoint,
  EvidenceEndpointStatus,
  EvidenceSourceAvailability,
  FeaturedSenatorEntry,
  HistoricalVoteReference,
  LikelyReason,
  LikelyReasonCategory,
  PartyPositionAnalysis,
  PartyStance,
  PolicyDelta,
  PolicyDeltaAction,
  RecipientEvidence,
  SourceCoverage,
  SponsorPartySignal,
  StakeholderImpact,
  UnknownReason,
  VoteCast,
  VoteContentConfidence,
  VoteContentProfile,
  VoteDetailResponse,
  VotePartyBreakdown,
  VoteSourceBasis,
  VoteStatus,
} from '@contract';

import type { ActivityIndexJson, PartyArgumentSummary, SourceCoverageLevel } from '@contract';

/** Homepage activity index payload (worker: `ActivityIndexJson`). */
export type ActivityIndexResponse = ActivityIndexJson;

/** Vote detail party argument row (worker: `PartyArgumentSummary`). */
export type PartyArgumentSummaryView = PartyArgumentSummary;

/** Source coverage level on briefing/vote payloads (worker: `SourceCoverageLevel`). */
export type CoverageLevel = SourceCoverageLevel;
