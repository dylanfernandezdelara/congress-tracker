import type {
  BillAnalysis,
  BillAnalysisClaimRef,
  BillImpactEvidence,
} from "../types";
import type { AnalyzeBillInput, AnalyzeBillsResult } from "./types-shared";

export interface QuoteValidationSummary {
  totalQuotes: number;
  validQuotes: number;
  invalidQuotes: number;
  pctValid: number;
}

export interface ConfidenceCalibrationSummary {
  evaluatedCount: number;
  mismatchCount: number;
  mismatchPct: number;
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPunctuation(text: string): string {
  return text.replace(/[^a-z0-9\s]/gi, "").replace(/\s+/g, " ").trim();
}

function collectAnalysisRefs(analysis: BillAnalysis): BillAnalysisClaimRef[] {
  const refs: BillAnalysisClaimRef[] = [];
  for (const claim of analysis.claims ?? []) refs.push(...claim.evidence_refs);
  for (const entry of analysis.benefit_map ?? []) refs.push(...entry.evidence_refs);
  for (const entry of analysis.stakeholder_impacts ?? []) refs.push(...entry.evidence_refs);
  for (const entry of analysis.likely_reasons ?? []) refs.push(...entry.evidence_refs);
  return refs;
}

function isQuoteValid(quote: string, evidenceCorpus: string[]): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  if (!normalizedQuote) return false;
  if (normalizedQuote.length < 16) return true;
  const looseQuote = stripPunctuation(normalizedQuote);
  return evidenceCorpus.some((chunk) => {
    if (chunk.includes(normalizedQuote) || normalizedQuote.includes(chunk)) return true;
    const looseChunk = stripPunctuation(chunk);
    return looseChunk.includes(looseQuote) || looseQuote.includes(looseChunk);
  });
}

export function computeQuoteValidationSummary(
  analysis: BillAnalysis,
  impactEvidence?: BillImpactEvidence
): QuoteValidationSummary {
  const refs = collectAnalysisRefs(analysis);
  const evidenceCorpus = (impactEvidence?.summary_evidence ?? [])
    .map((chunk) => normalizeForMatch(chunk))
    .filter(Boolean);
  let totalQuotes = 0;
  let validQuotes = 0;
  for (const ref of refs) {
    if (!ref.quote?.trim()) continue;
    totalQuotes += 1;
    if (isQuoteValid(ref.quote, evidenceCorpus)) validQuotes += 1;
  }
  const invalidQuotes = totalQuotes - validQuotes;
  const pctValid = totalQuotes === 0 ? 100 : Number(((validQuotes / totalQuotes) * 100).toFixed(2));
  return {
    totalQuotes,
    validQuotes,
    invalidQuotes,
    pctValid,
  };
}

function isCalibrationMismatch(
  confidence: "high" | "medium" | "low",
  coverage: "full" | "partial" | "minimal"
): boolean {
  if (confidence === "high") return coverage !== "full";
  if (confidence === "medium") return coverage === "minimal";
  return false;
}

export function computeConfidenceCalibrationSummary(
  analysis: BillAnalysis
): ConfidenceCalibrationSummary {
  const coverage = analysis.analysis_quality?.evidence_coverage ?? "minimal";
  const confidenceValues: Array<"high" | "medium" | "low"> = [];
  if (analysis.confidence) confidenceValues.push(analysis.confidence);
  for (const position of analysis.party_positions ?? []) confidenceValues.push(position.confidence);
  for (const impact of analysis.stakeholder_impacts ?? []) confidenceValues.push(impact.confidence);
  for (const reason of analysis.likely_reasons ?? []) confidenceValues.push(reason.confidence);

  let mismatchCount = 0;
  for (const confidence of confidenceValues) {
    if (isCalibrationMismatch(confidence, coverage)) mismatchCount += 1;
  }
  const evaluatedCount = confidenceValues.length;
  const mismatchPct =
    evaluatedCount === 0 ? 0 : Number(((mismatchCount / evaluatedCount) * 100).toFixed(2));
  return {
    evaluatedCount,
    mismatchCount,
    mismatchPct,
  };
}

export interface QualityGateConfig {
  minClaimsCoveragePct: number;
  minQuoteValidityPct: number;
  maxConfidenceMismatchPct: number;
  hardGates: boolean;
}

export function claimCoverage(analysisByKey: Map<string, BillAnalysis>): number {
  let total = 0;
  let withRefs = 0;
  for (const analysis of analysisByKey.values()) {
    for (const claim of analysis.claims ?? []) {
      if (claim.kind === "unknown") continue;
      total += 1;
      if ((claim.evidence_refs?.length ?? 0) > 0) withRefs += 1;
    }
  }
  if (total === 0) return 0;
  return Number(((withRefs / total) * 100).toFixed(2));
}

export function benefitMapCoverage(analysisByKey: Map<string, BillAnalysis>): number {
  let total = 0;
  let withRefs = 0;
  for (const analysis of analysisByKey.values()) {
    for (const entry of analysis.benefit_map ?? []) {
      total += 1;
      if ((entry.evidence_refs?.length ?? 0) > 0) withRefs += 1;
    }
  }
  if (total === 0) return 0;
  return Number(((withRefs / total) * 100).toFixed(2));
}

export function likelyReasonCoverage(analysisByKey: Map<string, BillAnalysis>): number {
  let total = 0;
  let withRefs = 0;
  for (const analysis of analysisByKey.values()) {
    for (const reason of analysis.likely_reasons ?? []) {
      total += 1;
      if ((reason.evidence_refs?.length ?? 0) > 0) withRefs += 1;
    }
  }
  if (total === 0) return 0;
  return Number(((withRefs / total) * 100).toFixed(2));
}

export function qualityCoverage(
  analysisByKey: Map<string, BillAnalysis>,
  requestedByKey: Map<string, AnalyzeBillInput>
): { quoteValidityPct: number; confidenceCalibrationMismatchPct: number } {
  let quoteTotal = 0;
  let quoteValid = 0;
  let calibrationTotal = 0;
  let calibrationMismatch = 0;

  for (const [key, analysis] of analysisByKey.entries()) {
    const input = requestedByKey.get(key);
    const quoteSummary = computeQuoteValidationSummary(analysis, input?.impactEvidence);
    quoteTotal += quoteSummary.totalQuotes;
    quoteValid += quoteSummary.validQuotes;

    const calibrationSummary = computeConfidenceCalibrationSummary(analysis);
    calibrationTotal += calibrationSummary.evaluatedCount;
    calibrationMismatch += calibrationSummary.mismatchCount;
  }

  const quoteValidityPct =
    quoteTotal === 0 ? 100 : Number(((quoteValid / quoteTotal) * 100).toFixed(2));
  const confidenceCalibrationMismatchPct =
    calibrationTotal === 0
      ? 0
      : Number(((calibrationMismatch / calibrationTotal) * 100).toFixed(2));

  return { quoteValidityPct, confidenceCalibrationMismatchPct };
}

export function evaluateQualityGates(
  result: AnalyzeBillsResult,
  config: QualityGateConfig
): string[] {
  const failures: string[] = [];
  if (result.claimsWithEvidenceRefPct < config.minClaimsCoveragePct) {
    failures.push(
      `claims coverage ${result.claimsWithEvidenceRefPct}% < ${config.minClaimsCoveragePct}%`
    );
  }
  if (result.quoteValidityPct < config.minQuoteValidityPct) {
    failures.push(
      `quote validity ${result.quoteValidityPct}% < ${config.minQuoteValidityPct}%`
    );
  }
  if (result.confidenceCalibrationMismatchPct > config.maxConfidenceMismatchPct) {
    failures.push(
      `confidence mismatch ${result.confidenceCalibrationMismatchPct}% > ${config.maxConfidenceMismatchPct}%`
    );
  }
  return failures;
}
