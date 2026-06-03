import type {
  AnalysisQuality,
  BenefitMapEntry,
  BillAnalysis,
  BillAnalysisClaimRef,
  BillImpactEvidence,
  BillRef,
  LikelyReason,
  LikelyReasonCategory,
  PartyPositionAnalysis,
  PolicyDelta,
  StakeholderImpact,
} from "../types";

export interface BillAnalysisCacheMap {
  [billKey: string]: BillAnalysis;
}

export interface AnalyzeBillInput {
  bill: BillRef;
  impactEvidence?: BillImpactEvidence;
}

export interface AnalyzeBillsOptions {
  apiKey: string;
  model?: string;
  models?: string[];
  maxNewAnalyses?: number;
  appReferer?: string;
  appTitle?: string;
  timeoutMs?: number;
  maxRetries?: number;
  analysisConcurrency?: number;
}

export interface AnalyzeBillsResult {
  analysisByKey: Map<string, BillAnalysis>;
  analyzedCount: number;
  cacheHitCount: number;
  skippedCount: number;
  deferredCount: number;
  fallbackCount: number;
  inputSkipCount: number;
  claimsWithEvidenceRefPct: number;
  benefitMapWithEvidenceRefPct: number;
  likelyReasonsWithEvidenceRefPct: number;
  quoteValidityPct: number;
  confidenceCalibrationMismatchPct: number;
}
