/** Shared Senate LIS vote-menu helpers (Worker + ops refresh script). */

export function senateVoteMenuUrl(congress, session) {
  return `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
}

export function senateVoteMenuCacheKey(congress, session) {
  return `senate_vote_menu_cache_${congress}_${session}`;
}

/**
 * Structural + optional congress/session check before accepting menu XML.
 * Rejects near-empty shells that would wipe a good D1 fallback cache.
 *
 * @param {string} xml
 * @param {{ congress?: number; session?: number }} [opts]
 */
export function isSenateVoteMenuXml(xml, opts) {
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

  const congress = Number.parseInt(congressMatch[1], 10);
  const session = Number.parseInt(sessionMatch[1], 10);
  if (!Number.isFinite(congress) || !Number.isFinite(session)) return false;

  if (opts?.congress !== undefined && congress !== opts.congress) return false;
  if (opts?.session !== undefined && session !== opts.session) return false;

  // Require at least one numeric roll so a stub menu cannot replace production.
  const voteNumbers = [...trimmed.matchAll(/<vote_number>\s*(\d+)\s*<\/vote_number>/gi)];
  return voteNumbers.length >= 1;
}
