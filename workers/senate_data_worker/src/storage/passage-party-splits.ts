import type { RollPartySplit } from "../../../../shared/stats-api-types";
import { isLocalSampleMemberId } from "../../../../shared/member-id";
import { rollPartySplits } from "../analytics/roll-party-stats";
import { selectMemberVotesForRollKeys } from "../d1/member-votes";
import { hasRealMemberRoster } from "../d1/members";

export function rollIdentityKey(
  chamber: string,
  congress: number,
  session: number,
  rollNumber: number
): string {
  return `${chamber}:${congress}:${session}:${rollNumber}`;
}

/** Party splits per passage roll from `member_votes`; `available` is false when no member rows exist yet. */
export async function loadPassagePartySplits(
  db: D1Database,
  rolls: Array<{ chamber: string; congress: number; session: number; roll_number: number }>
): Promise<Map<string, { splits: RollPartySplit[]; available: boolean }>> {
  const out = new Map<string, { splits: RollPartySplit[]; available: boolean }>();
  if (rolls.length === 0) return out;

  const groups = new Map<string, typeof rolls>();
  for (const roll of rolls) {
    const key = `${roll.congress}:${roll.session}`;
    const list = groups.get(key) ?? [];
    list.push(roll);
    groups.set(key, list);
  }

  const excludeLocalSample = await hasRealMemberRoster(db);

  for (const group of groups.values()) {
    const first = group[0]!;
    const rows = await selectMemberVotesForRollKeys(
      db,
      first.congress,
      first.session,
      group.map((roll) => ({ chamber: roll.chamber, roll_number: roll.roll_number }))
    );
    const byRoll = new Map<string, Array<{ party: string | null; position: string }>>();
    for (const row of rows) {
      if (excludeLocalSample && isLocalSampleMemberId(row.bioguide_id)) continue;
      const key = rollIdentityKey(row.chamber, row.congress, row.session, row.roll_number);
      const list = byRoll.get(key) ?? [];
      list.push({ party: row.party, position: row.position });
      byRoll.set(key, list);
    }
    for (const roll of group) {
      const key = rollIdentityKey(roll.chamber, roll.congress, roll.session, roll.roll_number);
      const positions = byRoll.get(key) ?? [];
      out.set(key, {
        splits: rollPartySplits(positions),
        available: positions.length > 0,
      });
    }
  }

  return out;
}

