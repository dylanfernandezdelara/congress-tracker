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
import type { AnalyzeBillInput } from "./types-shared";
import { ANALYSIS_VERSION, DEFAULT_OPENROUTER_MODELS } from "./constants";

export { ANALYSIS_VERSION };
const VAGUE_PHRASE_RE =
  /\b(sets funding levels|may influence services|based on available official summary details|could affect|may affect federal spending priorities)\b/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(text: string): string {
  return text
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

function firstSentence(text: string, maxLen = 200): string {
  const plain = stripHtml(text);
  if (!plain) return "";
  const match = plain.match(/^(.+?[.!?])(\s|$)/);
  const sentence = match ? match[1] : plain;
  if (sentence.length <= maxLen) return sentence;
  return sentence.slice(0, maxLen).replace(/\s+\S*$/, "") + "…";
}

function defaultPlainTitle(ref: BillRef): string {
  if (ref.title?.trim()) return ref.title.trim();
  const type = ref.type?.trim().toUpperCase() || "BILL";
  const number = ref.number?.trim() || "?";
  return `${type} ${number}`;
}

function defaultPlainSummary(ref: BillRef): string {
  if (ref.summary?.trim()) return firstSentence(ref.summary);
  return "Official sources do not provide enough detail yet.";
}

function sanitizeSignificance(value: unknown): BillAnalysis["significance"] {
  if (typeof value !== "string") return "medium";
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "medium";
}

function sanitizeConfidence(value: unknown): NonNullable<BillAnalysis["confidence"]> {
  if (typeof value !== "string") return "low";
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "low";
}

function downgradeConfidence(
  value: NonNullable<BillAnalysis["confidence"]>,
  steps: number
): NonNullable<BillAnalysis["confidence"]> {
  if (steps <= 0) return value;
  if (value === "high") return steps > 1 ? "low" : "medium";
  if (value === "medium") return "low";
  return "low";
}

function hasConcreteSignal(text: string): boolean {
  return /(\$|\d{1,3}(,\d{3})+|\b\d+\b|million|billion|department|agency|program|grant)/i.test(text);
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableSerialize(val)}`)
    .join(",")}}`;
}

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildEvidenceFingerprint(ref: BillRef, evidence?: BillImpactEvidence): string {
  const payload = {
    bill: {
      title: ref.title ?? "",
      summary: ref.summary ?? "",
      policy_area: ref.policy_area ?? "",
      subjects: ref.subjects ?? [],
      latest_action_text: ref.latest_action?.text ?? "",
      latest_action_date: ref.latest_action?.action_date ?? "",
    },
    impact: evidence
      ? {
          schema_version: evidence.schema_version,
          bill_key: evidence.bill_key,
          source_availability: evidence.source_availability,
          who: evidence.who,
          what: evidence.what,
          how_much: evidence.how_much,
          when: evidence.when,
          where: evidence.where,
          unknowns: evidence.unknowns,
          policy_deltas: evidence.policy_deltas ?? [],
          richness_score: evidence.richness_score,
          summary_evidence: evidence.summary_evidence,
        }
      : null,
  };
  return fnv1aHash(stableSerialize(payload));
}

function sanitizeNarrativeText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (VAGUE_PHRASE_RE.test(trimmed) && !hasConcreteSignal(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function sanitizeStringList(value: unknown, max = 4, requireConcrete = false): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (VAGUE_PHRASE_RE.test(trimmed) && !hasConcreteSignal(trimmed)) continue;
    if (requireConcrete && !hasConcreteSignal(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

function buildMoneyFlowsFromEvidence(evidence?: BillImpactEvidence): string[] {
  if (!evidence) return [];
  const amounts = evidence.how_much.slice(0, 4);
  if (amounts.length === 0) return [];
  const recipient = evidence.who[0]?.name;
  return amounts.map((amount) => {
    const dollars = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount.value_numeric);
    if (recipient) return `${dollars} for ${recipient}`;
    return `${dollars} referenced in official legislative text`;
  });
}

function buildStateLocalImpact(evidence?: BillImpactEvidence): string {
  if (!evidence) {
    return "State-level allocation detail is not specified in available official sources.";
  }
  const states = evidence.where.states_mentioned;
  if (states.length > 0) {
    return `Named state signal detected for: ${states.join(", ")}.`;
  }
  if (evidence.where.geography_scope === "state-formula") {
    return "State-level formula distribution is referenced, but no state-by-state dollar split is specified.";
  }
  if (evidence.where.geography_scope === "local") {
    return "Local-level impact is referenced, but exact local allocation amounts are not specified.";
  }
  return "State-level allocation detail is not specified in available official sources.";
}

function buildUnknownStrings(evidence?: BillImpactEvidence): string[] {
  if (!evidence) return ["Official source detail is limited for this item."];
  if (evidence.unknowns.length > 0) return evidence.unknowns.map((item) => item.reason).slice(0, 6);
  return [];
}

export function normalizeModelList(value?: string | string[]): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const normalized = raw
    .map((item) => item.trim())
    .filter(Boolean);
  if (normalized.length === 0) {
    return [...DEFAULT_OPENROUTER_MODELS];
  }
  return Array.from(new Set(normalized));
}

function buildEvidenceLines(evidence?: BillImpactEvidence): string[] {
  if (!evidence) return [];
  return evidence.summary_evidence.slice(0, 5);
}

export function ensureClaimsHaveRefs(analysis: BillAnalysis): boolean {
  const claims = analysis.claims ?? [];
  for (const claim of claims) {
    if (claim.kind === "unknown") continue;
    if (!claim.evidence_refs || claim.evidence_refs.length === 0) return false;
  }
  return true;
}

function sanitizeStance(value: unknown): PartyPositionAnalysis["stance"] {
  if (typeof value !== "string") return "mixed";
  const lc = value.trim().toLowerCase();
  if (lc === "support" || lc === "oppose" || lc === "mixed") return lc;
  return "mixed";
}

function coerceEvidenceRefs(raw: unknown): BillAnalysisClaimRef[] {
  if (!Array.isArray(raw)) return [];
  const refs: BillAnalysisClaimRef[] = [];
  for (const ref of raw) {
    if (!ref || typeof ref !== "object") continue;
    const r = ref as Record<string, unknown>;
    const sourceRef = typeof r.source_ref === "string" ? r.source_ref.trim() : "";
    if (!sourceRef) continue;
    const quote = typeof r.quote === "string" ? r.quote.trim() : "";
    refs.push({
      source_endpoint: (typeof r.source_endpoint === "string" ? r.source_endpoint : "summary") as BillAnalysisClaimRef["source_endpoint"],
      source_ref: sourceRef,
      quote: quote || undefined,
    });
  }
  return refs;
}

function sanitizeEffect(value: unknown): BenefitMapEntry["expected_effect"] {
  if (typeof value !== "string") return "mixed";
  const effect = value.trim().toLowerCase();
  if (effect === "benefit" || effect === "burden" || effect === "mixed") {
    return effect;
  }
  return "mixed";
}

function sanitizePolicyDeltaAction(value: unknown): PolicyDelta["action"] {
  if (typeof value !== "string") return "other";
  const action = value.trim().toLowerCase();
  const valid: PolicyDelta["action"][] = [
    "nullify",
    "reinstate",
    "decouple",
    "restore",
    "expand",
    "restrict",
    "authorize",
    "prohibit",
    "modify",
    "other",
  ];
  return valid.includes(action as PolicyDelta["action"]) ? (action as PolicyDelta["action"]) : "other";
}

function sanitizeLikelyReasonCategory(value: unknown): LikelyReasonCategory {
  if (typeof value !== "string") return "other";
  const category = value.trim().toLowerCase();
  const valid: LikelyReasonCategory[] = [
    "fiscal",
    "federalism",
    "labor",
    "business",
    "administrative",
    "legal",
    "other",
  ];
  return valid.includes(category as LikelyReasonCategory) ? (category as LikelyReasonCategory) : "other";
}

function coercePolicyDeltas(raw: unknown, impactEvidence?: BillImpactEvidence): PolicyDelta[] {
  const source = Array.isArray(raw) ? raw : impactEvidence?.policy_deltas ?? [];
  if (!Array.isArray(source)) return [];
  const out: PolicyDelta[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const target = typeof obj.target === "string" ? obj.target.trim() : "";
    if (!target) continue;
    const refs = coerceEvidenceRefs(obj.evidence_refs);
    if (refs.length === 0) continue;
    out.push({
      action: sanitizePolicyDeltaAction(obj.action),
      target,
      before_state: typeof obj.before_state === "string" ? obj.before_state.trim() || undefined : undefined,
      after_state: typeof obj.after_state === "string" ? obj.after_state.trim() || undefined : undefined,
      confidence: sanitizeConfidence(obj.confidence),
      evidence_refs: refs,
    });
  }
  return out.slice(0, 10);
}

function coerceStakeholderImpacts(raw: unknown): StakeholderImpact[] {
  if (!Array.isArray(raw)) return [];
  const out: StakeholderImpact[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const group = typeof obj.group === "string" ? obj.group.trim() : "";
    const mechanism = typeof obj.mechanism === "string" ? obj.mechanism.trim() : "";
    if (!group || !mechanism) continue;
    const refs = coerceEvidenceRefs(obj.evidence_refs);
    if (refs.length === 0) continue;
    out.push({
      group,
      effect: sanitizeEffect(obj.effect ?? obj.expected_effect),
      mechanism,
      confidence: sanitizeConfidence(obj.confidence),
      evidence_refs: refs,
    });
  }
  return out.slice(0, 8);
}

function coerceLikelyReasons(raw: unknown): LikelyReason[] {
  if (!Array.isArray(raw)) return [];
  const out: LikelyReason[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const actor = typeof obj.actor === "string" ? obj.actor.trim() : "";
    const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
    if (!actor || !reason) continue;
    const refs = coerceEvidenceRefs(obj.evidence_refs);
    if (refs.length === 0) continue;
    out.push({
      actor,
      category: sanitizeLikelyReasonCategory(obj.category),
      reason,
      confidence: sanitizeConfidence(obj.confidence),
      inference_label: "inference",
      evidence_refs: refs,
    });
  }
  return out.slice(0, 8);
}

function deriveBenefitMapFromStakeholderImpacts(stakeholderImpacts: StakeholderImpact[]): BenefitMapEntry[] {
  return stakeholderImpacts.map((impact) => ({
    group: impact.group,
    expected_effect: impact.effect,
    evidence_refs: impact.evidence_refs,
  }));
}

function deriveStakeholderImpactsFromBenefitMap(benefitMap: BenefitMapEntry[]): StakeholderImpact[] {
  return benefitMap.map((entry) => ({
    group: entry.group,
    effect: entry.expected_effect,
    mechanism: "Effect inferred from official bill evidence and referenced policy language.",
    confidence: "medium",
    evidence_refs: entry.evidence_refs,
  }));
}

function coercePartyPositions(raw: unknown): PartyPositionAnalysis[] {
  if (!Array.isArray(raw)) return [];
  const out: PartyPositionAnalysis[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const party = typeof obj.party === "string" ? obj.party.trim() : "";
    if (!party) continue;
    const evidencePoints = sanitizeStringList(obj.evidence_points, 4);
    const inferredRationale = sanitizeStringList(obj.inferred_rationale, 3);
    if (evidencePoints.length === 0 && inferredRationale.length === 0) continue;
    out.push({
      party,
      stance: sanitizeStance(obj.stance),
      evidence_points: evidencePoints,
      inferred_rationale: inferredRationale,
      confidence: sanitizeConfidence(obj.confidence),
    });
  }
  return out.slice(0, 4);
}

function coerceBenefitMap(raw: unknown): BenefitMapEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: BenefitMapEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const group = typeof obj.group === "string" ? obj.group.trim() : "";
    if (!group) continue;
    const refs = coerceEvidenceRefs(obj.evidence_refs);
    if (refs.length === 0) continue;
    out.push({
      group,
      expected_effect: sanitizeEffect(obj.expected_effect),
      evidence_refs: refs,
    });
  }
  return out.slice(0, 6);
}

function coerceAnalysisQuality(
  raw: unknown,
  partyPositions: PartyPositionAnalysis[],
  likelyReasons: LikelyReason[],
  impactEvidence?: BillImpactEvidence,
): AnalysisQuality {
  const richScore = impactEvidence?.richness_score ?? 0;
  const inferenceUsed =
    partyPositions.some((p) => p.inferred_rationale.length > 0) ||
    likelyReasons.length > 0;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const coverage = typeof obj.evidence_coverage === "string" ? obj.evidence_coverage.trim().toLowerCase() : "";
    const validCoverage = coverage === "full" || coverage === "partial" || coverage === "minimal"
      ? coverage as AnalysisQuality["evidence_coverage"]
      : richScore >= 60 ? "full" : richScore >= 30 ? "partial" : "minimal";
    return {
      evidence_coverage: validCoverage,
      inference_used: inferenceUsed,
      confidence_reason: typeof obj.confidence_reason === "string" ? obj.confidence_reason.trim() : buildDefaultConfidenceReason(validCoverage, inferenceUsed),
    };
  }
  const coverage: AnalysisQuality["evidence_coverage"] = richScore >= 60 ? "full" : richScore >= 30 ? "partial" : "minimal";
  return {
    evidence_coverage: coverage,
    inference_used: inferenceUsed,
    confidence_reason: buildDefaultConfidenceReason(coverage, inferenceUsed),
  };
}

function buildDefaultConfidenceReason(coverage: AnalysisQuality["evidence_coverage"], inferenceUsed: boolean): string {
  if (coverage === "full" && !inferenceUsed) return "Based on official evidence with no inference needed.";
  if (coverage === "full") return "Strong official evidence with supplementary inference.";
  if (coverage === "partial") return "Partial official evidence available; some analysis is inferred.";
  return "Limited official evidence; party positions are largely inferred from voting patterns.";
}

function coerceClaims(raw: unknown, evidence?: BillImpactEvidence): BillAnalysis["claims"] {
  if (!Array.isArray(raw)) {
    if (!evidence || evidence.summary_evidence.length === 0) return [];
    return [
      {
        text: "Primary summary claim grounded in official evidence text.",
        kind: "summary",
        evidence_refs: [
          {
            source_endpoint: "summaries",
            source_ref: "summary_evidence:1",
            quote: evidence.summary_evidence[0],
          },
        ],
      },
    ];
  }
  const out: NonNullable<BillAnalysis["claims"]> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.text !== "string" || !obj.text.trim()) continue;
    const refs = coerceEvidenceRefs(obj.evidence_refs);
    const kind = typeof obj.kind === "string" ? obj.kind : undefined;
    out.push({
      text: obj.text.trim(),
      kind: kind as "summary" | "impact" | "money" | "unknown" | undefined,
      evidence_refs: refs,
    });
  }
  return out.slice(0, 8);
}

export function coerceBillAnalysis(raw: unknown, ref: BillRef, impactEvidence?: BillImpactEvidence): BillAnalysis {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const defaultSummary = defaultPlainSummary(ref);

  const moneyFlowsRaw = sanitizeStringList(obj.money_flows, 6, true);
  const moneyFlows = moneyFlowsRaw.length > 0 ? moneyFlowsRaw : buildMoneyFlowsFromEvidence(impactEvidence);
  const pocketbookImpact = sanitizeStringList(obj.pocketbook_impact, 6);
  const sanitizedUnknowns = sanitizeStringList(obj.unknowns, 6);
  const sanitizedEvidence = sanitizeStringList(obj.evidence, 5);

  const richScore = impactEvidence?.richness_score ?? 0;
  const unknownPenalty = Math.floor((impactEvidence?.unknowns.length ?? 0) / 2);
  const confidenceFallbackBase: NonNullable<BillAnalysis["confidence"]> =
    richScore >= 60 ? "high" : richScore >= 30 ? "medium" : "low";
  const confidenceFallback = downgradeConfidence(confidenceFallbackBase, unknownPenalty);

  const plainSummary = sanitizeNarrativeText(obj.plain_summary, defaultSummary);
  const whyFallback =
    richScore >= 50
      ? "Official evidence indicates concrete federal policy changes with measurable implementation details."
      : "Official sources currently provide limited detail for estimating direct household-level impact.";
  const policyDeltas = coercePolicyDeltas(obj.policy_deltas, impactEvidence);
  let benefitMap = coerceBenefitMap(obj.benefit_map);
  let stakeholderImpacts = coerceStakeholderImpacts(obj.stakeholder_impacts);
  if (stakeholderImpacts.length === 0 && benefitMap.length > 0) {
    stakeholderImpacts = deriveStakeholderImpactsFromBenefitMap(benefitMap);
  }
  if (benefitMap.length === 0 && stakeholderImpacts.length > 0) {
    benefitMap = deriveBenefitMapFromStakeholderImpacts(stakeholderImpacts);
  }
  const likelyReasons = coerceLikelyReasons(obj.likely_reasons);

  const analysis: BillAnalysis = {
    plain_title: sanitizeNarrativeText(obj.plain_title, defaultPlainTitle(ref)),
    plain_summary: plainSummary,
    key_provisions: sanitizeStringList(obj.key_provisions, 4),
    why_it_matters: sanitizeNarrativeText(obj.why_it_matters, whyFallback),
    hidden_provisions:
      typeof obj.hidden_provisions === "string" && obj.hidden_provisions.trim()
        ? obj.hidden_provisions.trim()
        : null,
    significance: sanitizeSignificance(obj.significance),
    significance_reason: sanitizeNarrativeText(
      obj.significance_reason,
      "Significance reflects scope, funding magnitude, and implementation breadth in available official sources."
    ),
    category:
      typeof obj.category === "string" && obj.category.trim()
        ? obj.category.trim()
        : ref.policy_area?.trim() || "Senate business",
    affects: sanitizeStringList(obj.affects, 5),
    money_flows: moneyFlows,
    pocketbook_impact:
      pocketbookImpact.length > 0
        ? pocketbookImpact
        : ["Official sources do not yet provide enough detail to estimate direct household-level cost changes."],
    state_local_impact: sanitizeNarrativeText(
      obj.state_local_impact,
      buildStateLocalImpact(impactEvidence)
    ),
    unknowns:
      sanitizedUnknowns.length > 0
        ? sanitizedUnknowns
        : buildUnknownStrings(impactEvidence),
    evidence:
      sanitizedEvidence.length > 0
        ? sanitizedEvidence
        : buildEvidenceLines(impactEvidence),
    confidence:
      typeof obj.confidence === "string"
        ? sanitizeConfidence(obj.confidence)
        : confidenceFallback,
    analysis_version: ANALYSIS_VERSION,
    evidence_fingerprint: buildEvidenceFingerprint(ref, impactEvidence),
    evidence_generated_at: impactEvidence?.generated_at,
    richness_score: impactEvidence?.richness_score ?? 0,
    structured_amounts: impactEvidence?.how_much ?? [],
    structured_recipients: impactEvidence?.who ?? [],
    geography_scope: impactEvidence?.where.geography_scope ?? "unknown",
    states_mentioned: impactEvidence?.where.states_mentioned ?? [],
    unknown_reasons: impactEvidence?.unknowns ?? [],
    policy_deltas: policyDeltas,
    claims: coerceClaims(obj.claims, impactEvidence),
    party_positions: coercePartyPositions(obj.party_positions),
    benefit_map: benefitMap,
    stakeholder_impacts: stakeholderImpacts,
    likely_reasons: likelyReasons,
  };

  analysis.analysis_quality = coerceAnalysisQuality(
    obj.analysis_quality,
    analysis.party_positions ?? [],
    analysis.likely_reasons ?? [],
    impactEvidence
  );

  if ((analysis.claims?.length ?? 0) === 0 && impactEvidence?.summary_evidence?.length) {
    analysis.claims = [
      {
        text: analysis.plain_summary,
        kind: "summary",
        evidence_refs: [
          {
            source_endpoint: "summaries",
            source_ref: "summary_evidence:1",
            quote: impactEvidence.summary_evidence[0],
          },
        ],
      },
    ];
  }
  return analysis;
}

export function isAnalysisRefreshNeeded(analysis: BillAnalysis, input: AnalyzeBillInput): boolean {
  if (!analysis.analysis_version || analysis.analysis_version !== ANALYSIS_VERSION) return true;
  if (!analysis.analysis_quality) return true;
  if (!analysis.unknown_reasons || analysis.unknown_reasons.length === 0) return true;
  if (!analysis.claims || analysis.claims.length === 0) return true;
  if (!ensureClaimsHaveRefs(analysis)) return true;
  if ((analysis.benefit_map ?? []).some((entry) => (entry.evidence_refs?.length ?? 0) === 0)) return true;
  if ((analysis.stakeholder_impacts ?? []).some((entry) => (entry.evidence_refs?.length ?? 0) === 0)) return true;
  if ((analysis.likely_reasons ?? []).some((entry) => (entry.evidence_refs?.length ?? 0) === 0)) return true;
  if (
    (input.impactEvidence?.policy_deltas?.length ?? 0) > 0 &&
    (analysis.policy_deltas?.length ?? 0) === 0
  ) {
    return true;
  }
  if (!analysis.evidence_fingerprint) return true;
  const currentFingerprint = buildEvidenceFingerprint(input.bill, input.impactEvidence);
  if (analysis.evidence_fingerprint !== currentFingerprint) return true;
  if (input.impactEvidence && !analysis.evidence_generated_at) return true;
  return false;
}
