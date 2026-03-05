import type {
  BillAnalysis,
  BillAnalysisClaimRef,
  BillImpactEvidence,
} from "./types";

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

