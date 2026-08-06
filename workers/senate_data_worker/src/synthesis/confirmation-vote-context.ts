import type { Env } from "../config";
import {
  buildContestedVotePrompt,
  rewriteGroundedStringField,
  selectSourceParagraphs,
  type GroundedSummaryResult,
} from "./grounded-summary";

/** Two short sentences of grounded context. */
const VOTE_CONTEXT_MAX_CHARS = 360;

/** Paragraphs about the nomination fight, hearings, or the vote itself. */
const CONFIRMATION_CONTEXT_PARAGRAPH_CUE =
  /\b(?:nominat|confirm|senate|hearing|vote|oppos|controvers|criticiz|testif|committee)/i;

/**
 * Confirmation adapter over the shared grounded-summary helpers.
 *
 * Source: nominee Wikipedia article (hearing / nomination / vote paragraphs).
 * Storage field: `vote_context` on confirmation `background_json`.
 * Future bill adapters can call {@link buildContestedVotePrompt} /
 * {@link rewriteGroundedStringField} with a different source + cue.
 */

/**
 * Confirmation-relevant paragraphs from the nominee's Wikipedia article.
 * Returns null when the article says nothing about the nomination or vote —
 * there is nothing to ground a "why contested" summary on.
 */
export function selectVoteContextSource(articleText: string): string | null {
  return selectSourceParagraphs(articleText, CONFIRMATION_CONTEXT_PARAGRAPH_CUE);
}

export function buildVoteContextPrompt(params: {
  nomineeName: string;
  positionTitle: string | null;
  sourceText: string;
}): string {
  return buildContestedVotePrompt({
    voteKind: "U.S. Senate confirmation",
    identityLines: [
      { label: "NOMINEE", value: params.nomineeName },
      { label: "CONFIRMED AS", value: params.positionTitle ?? "N/A" },
    ],
    sourceLabel: "the nominee's Wikipedia article",
    sourceText: params.sourceText,
    fieldName: "vote_context",
    fieldDescription:
      "1-2 short sentences (max 50 words) explaining, per the source text, why the nomination was contested or drew scrutiny — controversies, concerns raised by senators, or positions the nominee took at the confirmation hearing. Empty string if the source text does not say.",
    extraRules: [
      "Do not restate the vote tally, the confirmation itself, or the person's job history — only why the vote was contested or what drew scrutiny.",
      'General biography or career praise is not vote context. If the source text gives no controversy, criticism, senator concerns, or hearing positions, return {"vote_context": ""}.',
    ],
  });
}

/**
 * Grounded "why the vote was contested" rewrite from Wikipedia source text.
 * - ok/text: grounded summary to store
 * - ok/null: model found nothing grounded (safe to seal)
 * - unavailable: request/parse failure (do not seal; retry next run)
 */
export async function rewriteVoteContext(
  env: Env,
  params: {
    nomineeName: string;
    positionTitle: string | null;
    sourceText: string;
  },
  model: string
): Promise<GroundedSummaryResult> {
  return rewriteGroundedStringField(env, {
    model,
    prompt: buildVoteContextPrompt(params),
    fieldName: "vote_context",
    maxChars: VOTE_CONTEXT_MAX_CHARS,
  });
}
