import type { Env } from "../config";
import { selectExistingVoteKeys, upsertVote } from "../d1/votes";
import { ingestHousePassageVotesForBill } from "../sources/house-votes";
import { ingestSenatePassageVotes } from "../sources/senate-votes";
import { normalizeBillType } from "../sources/bill-type";
import type { BillRef } from "../types";
import { voteKey } from "../vote-key";

function billsMatch(a: BillRef, b: BillRef): boolean {
  return (
    a.congress === b.congress &&
    normalizeBillType(a.type) === normalizeBillType(b.type) &&
    a.number === b.number
  );
}

/** Upsert passage votes for one bill from Senate menu + targeted House scan. */
export async function ingestPassageVotesForBill(env: Env, bill: BillRef): Promise<number> {
  if (!env.CONGRESS_API_KEY?.trim()) return 0;

  const knownKeys = await selectExistingVoteKeys(env.DB, "1970-01-01", bill.congress);
  let upserted = 0;

  const senateResult = await ingestSenatePassageVotes(env, null, knownKeys);
  for (const vote of senateResult.votes) {
    if (!billsMatch(vote.bill, bill)) continue;
    await upsertVote(env.DB, vote);
    knownKeys.add(voteKey(vote));
    upserted += 1;
  }

  const houseVotes = await ingestHousePassageVotesForBill(env, bill, knownKeys);
  for (const vote of houseVotes) {
    await upsertVote(env.DB, vote);
    knownKeys.add(voteKey(vote));
    upserted += 1;
  }

  return upserted;
}
