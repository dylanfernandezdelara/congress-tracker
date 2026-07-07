import type { PassageVote } from "./types";

export function voteKey(
  vote: Pick<PassageVote, "chamber" | "congress" | "session" | "rollNumber">
): string {
  return `${vote.chamber}:${vote.congress}:${vote.session}:${vote.rollNumber}`;
}
