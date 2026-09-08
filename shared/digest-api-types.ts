/**
 * Digest written deterministically from bill metadata because the OpenRouter
 * rewrite returned nothing (or the per-run rewrite budget was spent). The
 * daily feed ingest retries the LLM rewrite for these rows.
 */
export const DIGEST_SOURCE_TITLE_FALLBACK = 'title_fallback'

export interface BillDigestContent {
  headline: string
  what_it_does: string
  key_points: string[]
  terms_explained: Array<{ term: string; plain: string }>
  /** Absent for OpenRouter output; see `DIGEST_SOURCE_TITLE_FALLBACK`. */
  source?: typeof DIGEST_SOURCE_TITLE_FALLBACK
}
