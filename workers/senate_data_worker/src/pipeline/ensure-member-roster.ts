import type { Env } from "../config";
import { hasRealMemberRoster } from "../d1/members";
import { runMembersRosterPipeline } from "./run-members-roster";

/**
 * Sync the Congress.gov member roster when D1 has no real roster yet.
 * Safe to call from cron and read paths — upserts are idempotent.
 */
export async function ensureMemberRoster(env: Env): Promise<boolean> {
  if (await hasRealMemberRoster(env.DB)) return false;
  if (!env.CONGRESS_API_KEY?.trim()) return false;

  await runMembersRosterPipeline(env);
  return true;
}
