/** Types for shared/senate-vote-menu.mjs (Worker + ops script). */

export const PRODUCTION_D1_DATABASE_ID: string;

export const SENATE_VOTE_MENU_CACHE_UPSERT_SQL: string;

export function senateVoteMenuUrl(congress: number, session: number): string;

export function senateVoteMenuCacheKey(congress: number, session: number): string;

export function encodeSenateVoteMenuCacheValue(
  xml: string,
  fetchedAt?: string
): { fetchedAt: string; valueJson: string };

export function isSenateVoteMenuXml(
  xml: string,
  opts?: { congress?: number; session?: number }
): boolean;
