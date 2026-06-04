/**
 * Shared API contract types for worker read models and the web app.
 *
 * Pure data shapes only — no imports from runtime/pipeline modules.
 */

export type {
  ActivityIndexEntry,
  ActivityIndexJson,
  ActivitySource,
  ActivityType,
  ActivityWindow,
  AmountEvidence,
  AnalysisQuality,
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
  EvidenceEndpoint,
  EvidenceEndpointStatus,
  EvidenceSourceAvailability,
  FeaturedSenatorEntry,
  LikelyReason,
  LikelyReasonCategory,
  PartyPositionAnalysis,
  PartyStance,
  PolicyDelta,
  PolicyDeltaAction,
  RecipientEvidence,
  SponsorPartySignal,
  StakeholderImpact,
  UnknownReason,
  VoteContentConfidence,
  VoteContentProfile,
  VoteSourceBasis,
} from "./types";

export type {
  ArgumentExcerpt,
  ArgumentSourceType,
  BriefingCrossover,
  BriefingFeedItem,
  BriefingFeedResponse,
  BriefingVoteSummary,
  HistoricalVoteReference,
  PartyArgumentSummary,
  SourceCoverage,
  SourceCoverageLevel,
  VoteCast,
  VoteDetailResponse,
  VotePartyBreakdown,
  VoteStatus,
} from "./platform-types";
