import type { PassageVote } from "./types";

export function voteKey(
  vote: Pick<PassageVote, "chamber" | "congress" | "session" | "rollNumber">
): string {
  return `${vote.chamber}:${vote.congress}:${vote.session}:${vote.rollNumber}`;
}

export interface ParsedVoteKey {
  chamber: PassageVote["chamber"];
  congress: number;
  session: number;
  rollNumber: number;
}

export function parseVoteKey(value: string): ParsedVoteKey | null {
  const parts = value.split(":");
  if (parts.length !== 4) return null;

  const [chamber, congressRaw, sessionRaw, rollRaw] = parts;
  if (chamber !== "House" && chamber !== "Senate") return null;

  const congress = Number.parseInt(congressRaw, 10);
  const session = Number.parseInt(sessionRaw, 10);
  const rollNumber = Number.parseInt(rollRaw, 10);

  if (!Number.isFinite(congress) || !Number.isFinite(session) || !Number.isFinite(rollNumber)) {
    return null;
  }
  if (rollNumber <= 0) return null;

  return { chamber, congress, session, rollNumber };
}
