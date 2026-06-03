/**
 * Thin compatibility entry for bill synthesis. Implementation lives under
 * `synthesis/` (client, prompt, coerce, quality).
 */
export {
  BILL_ANALYSIS_CACHE_KEY,
  ANALYSIS_VERSION,
  DEFAULT_OPENROUTER_MODELS,
  DEFAULT_OPENROUTER_MODEL,
  analyzeBillsWithCache,
} from "./synthesis/client";
export type {
  AnalyzeBillInput,
  AnalyzeBillsOptions,
  AnalyzeBillsResult,
} from "./synthesis/types-shared";
