/** Shared Senate LIS vote-menu helpers (Worker + ops docs / contract tests). */

/** Production D1 id from wrangler.toml `[[d1_databases]].database_id`. */
export const PRODUCTION_D1_DATABASE_ID = "e21fa2df-1c7d-4a83-8044-f28803c80a26";

export const SENATE_VOTE_MENU_CACHE_UPSERT_SQL =
  "INSERT INTO pipeline_state (key, value_json, updated_at) VALUES (?1, ?2, ?3) " +
  "ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at";

export function senateVoteMenuUrl(congress: number, session: number): string {
  return `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
}

export function senateVoteMenuCacheKey(congress: number, session: number): string {
  return `senate_vote_menu_cache_${congress}_${session}`;
}

/**
 * Encode the D1 `pipeline_state.value_json` blob for a Senate vote menu cache row.
 */
export function encodeSenateVoteMenuCacheValue(
  xml: string,
  fetchedAt: string = new Date().toISOString()
): { fetchedAt: string; valueJson: string } {
  return {
    fetchedAt,
    valueJson: JSON.stringify({ fetched_at: fetchedAt, xml }),
  };
}

/**
 * Structural + optional congress/session check before accepting menu XML.
 * Rejects near-empty shells that would wipe a good D1 fallback cache.
 */
export function isSenateVoteMenuXml(
  xml: string,
  opts?: { congress?: number; session?: number }
): boolean {
  const trimmed = xml.trim();
  if (
    !trimmed.includes("<vote_summary>") ||
    !trimmed.includes("</vote_summary>") ||
    !trimmed.includes("<vote>") ||
    !trimmed.includes("<vote_number>") ||
    !trimmed.includes("<congress>") ||
    !trimmed.includes("<session>")
  ) {
    return false;
  }

  const congressMatch = trimmed.match(/<congress>\s*(\d+)\s*<\/congress>/i);
  const sessionMatch = trimmed.match(/<session>\s*(\d+)\s*<\/session>/i);
  if (!congressMatch || !sessionMatch) return false;

  const congress = Number.parseInt(congressMatch[1]!, 10);
  const session = Number.parseInt(sessionMatch[1]!, 10);
  if (!Number.isFinite(congress) || !Number.isFinite(session)) return false;

  if (opts?.congress !== undefined && congress !== opts.congress) return false;
  if (opts?.session !== undefined && session !== opts.session) return false;

  // Require at least one numeric roll so a stub menu cannot replace production.
  const voteNumbers = [...trimmed.matchAll(/<vote_number>\s*(\d+)\s*<\/vote_number>/gi)];
  return voteNumbers.length >= 1;
}
