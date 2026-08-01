/** Types for shared/senate-vote-menu.mjs (Worker + ops script). */

export function senateVoteMenuUrl(congress: number, session: number): string;

export function senateVoteMenuCacheKey(congress: number, session: number): string;

export function isSenateVoteMenuXml(
  xml: string,
  opts?: { congress?: number; session?: number }
): boolean;
