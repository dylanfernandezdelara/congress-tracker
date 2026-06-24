import type { Env } from "../config";
import { congressNumber } from "../config";
import { HOUSE_ROSTER_MIN, SENATE_ROSTER_MIN } from "../constants";
import { upsertMembersBatch, deletePlaceholderMemberIds } from "../d1/members";
import { storeSenateBioguideLookup } from "../d1/pipeline-state";
import { ensureSchema } from "../d1/schema";
import { fetchCongressMemberRoster } from "../sources/congress-member-roster";
import type { Chamber } from "../types";

export interface RunMembersRosterResult {
  congress: number;
  membersUpserted: number;
  house: number;
  senate: number;
}

function countByChamber(members: Array<{ chamber: Chamber }>): { house: number; senate: number } {
  let house = 0;
  let senate = 0;
  for (const member of members) {
    if (member.chamber === "House") house += 1;
    else senate += 1;
  }
  return { house, senate };
}

/**
 * Admin pipeline: sync the current Congress member roster from Congress.gov into D1.
 *
 * Local dev (DEV_OPEN_PIPELINE=1 in .dev.vars):
 *   curl -fsS -X POST http://127.0.0.1:8787/__pipeline/run/members-roster
 *
 * Production/preview (PIPELINE_ADMIN_TOKEN required):
 *   curl -fsS -X POST "$WORKER_URL/__pipeline/run/members-roster" \
 *     -H "Authorization: Bearer $PIPELINE_ADMIN_TOKEN"
 */
export async function runMembersRosterPipeline(env: Env): Promise<RunMembersRosterResult> {
  await ensureSchema(env.DB);
  const congress = congressNumber(env);
  const { members, senateBioguideLookup } = await fetchCongressMemberRoster(env);

  if (members.length === 0) {
    throw new Error("Congress.gov member roster returned no members");
  }

  const counts = countByChamber(members);
  if (counts.house < HOUSE_ROSTER_MIN || counts.senate < SENATE_ROSTER_MIN) {
    throw new Error(
      `Incomplete roster from Congress.gov (house=${counts.house}, senate=${counts.senate})`
    );
  }

  await upsertMembersBatch(env.DB, members);
  await storeSenateBioguideLookup(env.DB, senateBioguideLookup);
  await deletePlaceholderMemberIds(env.DB);

  return {
    congress,
    membersUpserted: members.length,
    house: counts.house,
    senate: counts.senate,
  };
}
