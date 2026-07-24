import { truncateAtSentenceBoundary } from "../../../../shared/feed-content";

/** Cap CRS text sent to OpenRouter so completions can finish within free-model limits. */
export const CRS_REWRITE_MAX_CHARS = 1200;

/**
 * Collapse whitespace and truncate for rewrite prompts.
 * Prefers a sentence boundary (abbreviation-aware) in the second half of the
 * window; otherwise cuts at a word boundary and appends an ellipsis.
 */
export function truncateCrsSummaryForRewrite(
  text: string,
  maxChars: number = CRS_REWRITE_MAX_CHARS
): string {
  return truncateAtSentenceBoundary(text, maxChars);
}
