import OpenAI from "openai";
import { mapWithConcurrency } from "./concurrency";
import { buildBillKey } from "./congress";
import { buildBillNarrativeKey, readJsonFromR2, writeJsonToR2 } from "./storage";
import type { BillAnalysis, BillImpactEvidence, BillRef } from "./types";

export const BILL_ANALYSIS_CACHE_KEY = "analysis/bill-analysis-cache.json";
export const ANALYSIS_VERSION = "v3-evidence-grounded";
export const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-r1-0528:free";

interface LegacyAnalysisCache {
  [billKey: string]: BillAnalysis;
}

export interface AnalyzeBillInput {
  bill: BillRef;
  impactEvidence?: BillImpactEvidence;
}

export interface AnalyzeBillsOptions {
  apiKey: string;
  model?: string;
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
  claimsWithEvidenceRefPct: number;
}

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

function buildEvidenceLines(evidence?: BillImpactEvidence): string[] {
  if (!evidence) return [];
  return evidence.summary_evidence.slice(0, 5);
}

function ensureClaimsHaveRefs(analysis: BillAnalysis): boolean {
  const claims = analysis.claims ?? [];
  for (const claim of claims) {
    if (claim.kind === "unknown") continue;
    if (!claim.evidence_refs || claim.evidence_refs.length === 0) return false;
  }
  return true;
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
    const refs = Array.isArray(obj.evidence_refs)
      ? obj.evidence_refs
          .map((ref) => {
            if (!ref || typeof ref !== "object") return null;
            const r = ref as Record<string, unknown>;
            const endpoint = typeof r.source_endpoint === "string" ? r.source_endpoint : "summaries";
            const sourceRef = typeof r.source_ref === "string" ? r.source_ref.trim() : "";
            if (!sourceRef) return null;
            const quote = typeof r.quote === "string" ? r.quote.trim() : undefined;
            return { source_endpoint: endpoint as "summary", source_ref: sourceRef, quote };
          })
          .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref))
      : [];
    const kind = typeof obj.kind === "string" ? obj.kind : undefined;
    out.push({
      text: obj.text.trim(),
      kind: kind as "summary" | "impact" | "money" | "unknown" | undefined,
      evidence_refs: refs,
    });
  }
  return out.slice(0, 8);
}

function coerceBillAnalysis(raw: unknown, ref: BillRef, impactEvidence?: BillImpactEvidence): BillAnalysis {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const defaultSummary = defaultPlainSummary(ref);

  const moneyFlowsRaw = sanitizeStringList(obj.money_flows, 6, true);
  const moneyFlows = moneyFlowsRaw.length > 0 ? moneyFlowsRaw : buildMoneyFlowsFromEvidence(impactEvidence);
  const pocketbookImpact = sanitizeStringList(obj.pocketbook_impact, 6);

  const richScore = impactEvidence?.richness_score ?? 0;
  const confidenceFallback: NonNullable<BillAnalysis["confidence"]> =
    richScore >= 60 ? "high" : richScore >= 30 ? "medium" : "low";

  const plainSummary = sanitizeNarrativeText(obj.plain_summary, defaultSummary);
  const whyFallback =
    richScore >= 50
      ? "Official evidence indicates concrete federal policy changes with measurable implementation details."
      : "Official sources currently provide limited detail for estimating direct household-level impact.";

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
      sanitizeStringList(obj.unknowns, 6).length > 0
        ? sanitizeStringList(obj.unknowns, 6)
        : buildUnknownStrings(impactEvidence),
    evidence:
      sanitizeStringList(obj.evidence, 5).length > 0
        ? sanitizeStringList(obj.evidence, 5)
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
    claims: coerceClaims(obj.claims, impactEvidence),
  };

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

function isAnalysisRefreshNeeded(analysis: BillAnalysis, input: AnalyzeBillInput): boolean {
  if (!analysis.analysis_version || analysis.analysis_version !== ANALYSIS_VERSION) return true;
  if (!analysis.unknown_reasons || analysis.unknown_reasons.length === 0) return true;
  if (!analysis.claims || analysis.claims.length === 0) return true;
  if (!ensureClaimsHaveRefs(analysis)) return true;
  if (!analysis.evidence_fingerprint) return true;
  const currentFingerprint = buildEvidenceFingerprint(input.bill, input.impactEvidence);
  if (analysis.evidence_fingerprint !== currentFingerprint) return true;
  if (input.impactEvidence && !analysis.evidence_generated_at) return true;
  return false;
}

function stripThinkTagsAndFences(text: string): string {
  let out = text.trim();
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenceMatch = out.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) out = fenceMatch[1].trim();
  return out;
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaping = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaping) escaping = false;
      else if (ch === "\\") escaping = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseModelJson(content: string): unknown {
  const cleaned = stripThinkTagsAndFences(content).trim();
  if (!cleaned) throw new Error("Empty model content");
  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonChunk = extractFirstJsonObject(cleaned);
    if (!jsonChunk) throw new Error("No JSON object found in model output");
    return JSON.parse(jsonChunk);
  }
}

function buildPrompt(input: AnalyzeBillInput): string {
  const ref = input.bill;
  const evidence = input.impactEvidence;
  const evidencePayload = evidence
    ? {
        richness_score: evidence.richness_score,
        who: evidence.who.slice(0, 8),
        what: evidence.what.slice(0, 8),
        how_much: evidence.how_much.slice(0, 8),
        when: evidence.when.slice(0, 8),
        where: evidence.where,
        unknowns: evidence.unknowns.slice(0, 8),
        summary_evidence: evidence.summary_evidence.slice(0, 8),
      }
    : null;

  return `You are a nonpartisan congressional analyst. Produce a grounded, plain-language synthesis for everyday U.S. readers.

OFFICIAL BILL CONTEXT:
- Title: ${ref.title ?? "N/A"}
- Bill: ${ref.type ?? "N/A"} ${ref.number ?? "N/A"}
- Policy area: ${ref.policy_area ?? "N/A"}
- Summary: ${ref.summary ?? "N/A"}
- Latest action: ${ref.latest_action?.text ?? "N/A"}

STRUCTURED EVIDENCE JSON:
${JSON.stringify(evidencePayload, null, 2)}

Return ONLY valid JSON with this structure:
{
  "plain_title": "string",
  "plain_summary": "string",
  "key_provisions": ["string"],
  "money_flows": ["string"],
  "pocketbook_impact": ["string"],
  "state_local_impact": "string",
  "unknowns": ["string"],
  "why_it_matters": "string",
  "hidden_provisions": "string or null",
  "evidence": ["string"],
  "confidence": "high|medium|low",
  "significance": "high|medium|low",
  "significance_reason": "string",
  "category": "string",
  "affects": ["string"],
  "claims": [
    {
      "text": "string",
      "kind": "summary|impact|money|unknown",
      "evidence_refs": [
        {
          "source_endpoint": "string",
          "source_ref": "string",
          "quote": "string"
        }
      ]
    }
  ]
}

RULES:
- Use only provided official context/evidence. Do not speculate.
- Avoid generic phrases like "sets funding levels" unless followed by concrete details.
- Every claim except kind="unknown" must include >=1 evidence_ref.
- If evidence is missing, state that explicitly in unknowns.
- Keep language neutral and concise.`;
}

function getMessageContent(message: unknown): string {
  if (typeof message === "string") return message;
  if (!message || typeof message !== "object") return "";
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string") parts.push(p.text);
    }
    return parts.join("\n").trim();
  }
  return "";
}

async function runModelCompletion(
  client: OpenAI,
  model: string,
  prompt: string,
  timeoutMs: number,
  maxRetries: number
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const request = client.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 1400,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      });
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`OpenRouter timeout after ${timeoutMs}ms`)), timeoutMs);
      });
      const completion = await Promise.race([request, timeout]);
      const message = completion.choices?.[0]?.message;
      return getMessageContent(message);
    } catch (error) {
      lastError = error;
      try {
        const fallbackRequest = client.chat.completions.create({
          model,
          temperature: 0,
          max_tokens: 1400,
          messages: [{ role: "user", content: prompt }],
        });
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`OpenRouter timeout after ${timeoutMs}ms`)), timeoutMs);
        });
        const completion = await Promise.race([fallbackRequest, timeout]);
        const message = completion.choices?.[0]?.message;
        return getMessageContent(message);
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }
    if (attempt < maxRetries) {
      await sleep(1_000 * Math.pow(2, attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function analyzeSingleBill(
  client: OpenAI,
  input: AnalyzeBillInput,
  model: string,
  timeoutMs: number,
  maxRetries: number
): Promise<BillAnalysis> {
  const prompt = buildPrompt(input);
  const parseAttempts = 2;

  const runAndCoerce = async (targetModel: string): Promise<BillAnalysis> => {
    let last: BillAnalysis | null = null;
    for (let attempt = 0; attempt < parseAttempts; attempt++) {
      const content = await runModelCompletion(client, targetModel, prompt, timeoutMs, maxRetries);
      const parsed = parseModelJson(content);
      const analysis = coerceBillAnalysis(parsed, input.bill, input.impactEvidence);
      last = analysis;
      if (ensureClaimsHaveRefs(analysis)) return analysis;
    }
    if (last) return last;
    throw new Error("Failed to parse grounded analysis output");
  };

  return runAndCoerce(model);
}

function claimCoverage(analysisByKey: Map<string, BillAnalysis>): number {
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

export async function analyzeBillsWithCache(
  bucket: R2Bucket,
  inputs: AnalyzeBillInput[],
  options: AnalyzeBillsOptions
): Promise<AnalyzeBillsResult> {
  const requestedByKey = new Map<string, AnalyzeBillInput>();
  for (const input of inputs) {
    const bill = input.bill;
    if (!bill || !bill.congress || !bill.type || !bill.number) continue;
    const key = buildBillKey(bill);
    if (!requestedByKey.has(key)) requestedByKey.set(key, input);
  }

  const legacyCache = (await readJsonFromR2<LegacyAnalysisCache>(bucket, BILL_ANALYSIS_CACHE_KEY)) ?? {};
  const analysisByKey = new Map<string, BillAnalysis>();
  let cacheHitCount = 0;
  let analyzedCount = 0;
  let skippedCount = 0;
  let legacyChanged = false;

  const model = options.model || DEFAULT_OPENROUTER_MODEL;
  const maxNewAnalyses = options.maxNewAnalyses ?? 20;
  const timeoutMs = Math.max(5_000, options.timeoutMs ?? 30_000);
  const maxRetries = Math.max(0, options.maxRetries ?? 2);
  const analysisConcurrency = Math.max(1, Math.min(options.analysisConcurrency ?? 2, 3));

  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": options.appReferer ?? "https://localhost",
      "X-Title": options.appTitle ?? "daily_senate_update_worker",
    },
  });

  const pending: Array<{ key: string; input: AnalyzeBillInput }> = [];
  const entries = Array.from(requestedByKey.entries());
  const cachedChecks = await mapWithConcurrency(entries, 4, async ([key, input]) => {
    const narrativeKey = buildBillNarrativeKey(key);
    const cachedNarrative = await readJsonFromR2<BillAnalysis>(bucket, narrativeKey);
    const cached = cachedNarrative ?? legacyCache[key];
    return { key, input, cached };
  });

  for (const item of cachedChecks) {
    const cached = item.cached;
    if (cached && !isAnalysisRefreshNeeded(cached, item.input)) {
      analysisByKey.set(item.key, cached);
      cacheHitCount++;
      continue;
    }
    pending.push({ key: item.key, input: item.input });
  }

  if (pending.length > maxNewAnalyses) {
    skippedCount += pending.length - maxNewAnalyses;
  }
  const work = pending.slice(0, maxNewAnalyses);

  const analyzed = await mapWithConcurrency(work, analysisConcurrency, async ({ key, input }) => {
    const bill = input.bill;
    if (!bill.summary && !bill.title) {
      return { key, analysis: null as BillAnalysis | null, skipped: true };
    }
    try {
      const analysis = await analyzeSingleBill(
        client,
        input,
        model,
        timeoutMs,
        maxRetries
      );
      return { key, analysis, skipped: false };
    } catch (error) {
      console.warn(
        `[openrouter] Analysis failed for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { key, analysis: null as BillAnalysis | null, skipped: true };
    }
  });

  for (const result of analyzed) {
    if (!result.analysis) {
      skippedCount++;
      continue;
    }
    analyzedCount++;
    analysisByKey.set(result.key, result.analysis);
    legacyCache[result.key] = result.analysis;
    legacyChanged = true;
    await writeJsonToR2(bucket, buildBillNarrativeKey(result.key), result.analysis);
  }

  if (legacyChanged) {
    await writeJsonToR2(bucket, BILL_ANALYSIS_CACHE_KEY, legacyCache);
  }

  return {
    analysisByKey,
    analyzedCount,
    cacheHitCount,
    skippedCount,
    claimsWithEvidenceRefPct: claimCoverage(analysisByKey),
  };
}
