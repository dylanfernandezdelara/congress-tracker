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

const DEFAULT_SOURCE_MAX_CHARS = 4000;
const DEFAULT_MIN_PARAGRAPH_LENGTH = 60;
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_REASONING_FALLBACK_MAX_TOKENS = 4096;

export type GroundedSummaryResult =
  | { status: "ok"; text: string | null }
  | { status: "unavailable" };

/**
 * Keep paragraphs matching `cue`, drop headings/stubs, cap total chars.
 * Returns null when nothing relevant remains — callers should seal empty
 * rather than ask the model to invent.
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

  const relevant = paragraphs.filter((p) => cue.test(p));
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
   * Extra exclusion rules after the shared grounding rules
   * (e.g. "biography is not vote context").
   */
  excludeGuidance: string;
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

  return `You summarize why a ${params.voteKind} vote was contested, for everyday readers.

${identity}

SOURCE TEXT (from ${params.sourceLabel}):
${params.sourceText}

Return ONLY valid JSON:
{
  "${params.fieldName}": "${params.fieldDescription}"
}

Rules:
- Use ONLY facts stated in the source text. Never invent reasons, motives, or controversies.
- ${params.excludeGuidance}
- Keep language neutral and concise (grade 7-8). No editorializing.`;
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
      maxTokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      reasoningFallbackMaxTokens:
        params.reasoningFallbackMaxTokens ??
        DEFAULT_REASONING_FALLBACK_MAX_TOKENS,
    }
  );

  if (parsed === null) return { status: "unavailable" };
  return { status: "ok", text: parsed || null };
}
