import { truncateAtSentenceBoundary } from "../../../../shared/feed-content";
import type { Env } from "../config";
import { jsonParseCandidates } from "./llm-json";
import { completeWithReasoningFallback } from "./openrouter-chat";

/**
 * Grounded single-string LLM summaries for "why this vote was contested".
 *
 * Domain adapters (confirmations today; bills later) supply:
 * - source text (Wikipedia article, CRS + companion votes, …)
 * - paragraph cue + prompt framing via {@link buildContestedVotePrompt}
 * - storage field name (e.g. `vote_context`)
 *
 * This module owns source chunking, JSON field parsing, and the OpenRouter
 * rewrite loop — not product-specific sealing or UI gating.
 */

/** Defaults tuned for Wikipedia-style articles (long paragraphs, `==` headings). */
const DEFAULT_SOURCE_MAX_CHARS = 4000;
const DEFAULT_MIN_PARAGRAPH_LENGTH = 60;

export type GroundedSummaryResult =
  | { status: "ok"; text: string | null }
  | { status: "unavailable" };

/** Match without mutating a caller's `/g` RegExp `lastIndex`. */
function paragraphMatchesCue(paragraph: string, cue: RegExp): boolean {
  const flags = cue.flags.replace(/g/g, "");
  return new RegExp(cue.source, flags).test(paragraph);
}

function escapePromptJsonString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Keep paragraphs matching `cue`, drop wiki headings/stubs, cap total chars.
 * Returns null when nothing relevant remains — callers should seal empty
 * rather than ask the model to invent.
 *
 * Default min length / heading strip are Wikipedia-oriented; override via
 * `options` for denser sources (CRS blurbs, vote questions, …).
 */
export function selectSourceParagraphs(
  text: string,
  cue: RegExp,
  options?: {
    minParagraphLength?: number;
    maxChars?: number;
  }
): string | null {
  const minLen = options?.minParagraphLength ?? DEFAULT_MIN_PARAGRAPH_LENGTH;
  const maxChars = options?.maxChars ?? DEFAULT_SOURCE_MAX_CHARS;

  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= minLen && !/^=+.*=+$/.test(p));

  const relevant = paragraphs.filter((p) => paragraphMatchesCue(p, cue));
  if (relevant.length === 0) return null;

  let out = "";
  for (const paragraph of relevant) {
    if (out.length + paragraph.length + 2 > maxChars) break;
    out += (out ? "\n\n" : "") + paragraph;
  }
  return out || null;
}

export interface ContestedVotePromptParams {
  /** e.g. "U.S. Senate confirmation", "House/Senate passage" */
  voteKind: string;
  /** Identity lines shown above the source (NOMINEE, BILL, …) */
  identityLines: Array<{ label: string; value: string }>;
  /** Human label for where sourceText came from */
  sourceLabel: string;
  sourceText: string;
  /** JSON field the model must return */
  fieldName: string;
  /**
   * What to put in the field when the source explains the fight
   * (controversies, hearing positions, partisan flashpoints, …).
   */
  fieldDescription: string;
  /**
   * Extra bullet rules after the shared grounding rule
   * (e.g. "biography is not vote context").
   */
  extraRules?: string[];
}

/**
 * Prompt for a grounded "why contested" string field.
 * Adapters customize identity, source label, and domain guidance; the
 * shared rules forbid inventing controversies not in the source text.
 */
export function buildContestedVotePrompt(
  params: ContestedVotePromptParams
): string {
  const identity = params.identityLines
    .map((line) => `${line.label}: ${line.value}`)
    .join("\n");
  const fieldName = escapePromptJsonString(params.fieldName);
  const fieldDescription = escapePromptJsonString(params.fieldDescription);
  const extraRules = (params.extraRules ?? [])
    .map((rule) => `- ${rule}`)
    .join("\n");

  return `You summarize why a ${params.voteKind} vote was contested, for everyday readers.

${identity}

SOURCE TEXT (from ${params.sourceLabel}):
${params.sourceText}

Return ONLY valid JSON:
{
  "${fieldName}": "${fieldDescription}"
}

Rules:
- Use ONLY facts stated in the source text. Never invent reasons, motives, or controversies.
${extraRules ? `${extraRules}\n` : ""}- Keep language neutral and concise (grade 7-8). No editorializing.`;
}

/**
 * Parse a single string JSON field from model output.
 * - non-empty string → truncated text
 * - `""` → empty string (model found nothing; safe to seal as null upstream)
 * - unparseable / wrong shape → null (retry / unavailable)
 */
export function parseGroundedStringField(
  text: string,
  fieldName: string,
  maxChars: number
): string | null {
  for (const candidate of jsonParseCandidates(text)) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      continue;
    }
    const value = parsed[fieldName];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    return trimmed ? truncateAtSentenceBoundary(trimmed, maxChars) : "";
  }
  return null;
}

/**
 * Grounded rewrite for a single string field.
 * - ok/text: grounded summary to store
 * - ok/null: model found nothing grounded (safe to seal)
 * - unavailable: request/parse failure (do not seal; retry next run)
 *
 * Token budgets default in {@link completeWithReasoningFallback}; pass
 * overrides only when the domain needs a larger first attempt (e.g. About).
 */
export async function rewriteGroundedStringField(
  env: Env,
  params: {
    model: string;
    prompt: string;
    fieldName: string;
    maxChars: number;
    maxTokens?: number;
    reasoningFallbackMaxTokens?: number;
  }
): Promise<GroundedSummaryResult> {
  const parsed = await completeWithReasoningFallback(
    env,
    params.model,
    params.prompt,
    (content) =>
      parseGroundedStringField(content, params.fieldName, params.maxChars),
    {
      maxTokens: params.maxTokens,
      reasoningFallbackMaxTokens: params.reasoningFallbackMaxTokens,
    }
  );

  if (parsed === null) return { status: "unavailable" };
  return { status: "ok", text: parsed || null };
}
