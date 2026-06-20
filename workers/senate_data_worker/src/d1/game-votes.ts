import { ensureSchema } from "./schema";
import type { PassageVote } from "../types";
import type { GamePartySplit } from "../../../../shared/game-api-types";

export interface GameVoteCandidateRow {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  bill_congress: number;
  bill_type: string;
  bill_number: number;
  question: string;
  result: string;
  yeas: number;
  nays: number;
  vote_date: string;
  title: string | null;
  raw_summary_text: string | null;
  digest_json: string | null;
}

export interface GameVoteKeyFilter {
  chamber: PassageVote["chamber"];
  congress: number;
  session: number;
  rollNumber: number;
}

const GAME_VOTE_SELECT = `
  SELECT v.chamber, v.congress, v.session, v.roll_number,
         v.bill_congress, v.bill_type, v.bill_number,
         v.question, v.result, v.yeas, v.nays, v.vote_date,
         d.title, d.raw_summary_text, d.digest_json
  FROM votes v
  LEFT JOIN bill_digests d
    ON d.congress = v.bill_congress
   AND d.bill_type = v.bill_type
   AND d.number = v.bill_number
  WHERE v.is_passage = 1
`;

export async function selectGameVoteCandidates(
  db: D1Database,
  lookbackDate: string,
  limit: number
): Promise<GameVoteCandidateRow[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `${GAME_VOTE_SELECT}
       AND v.vote_date >= ?
       ORDER BY v.vote_date DESC
       LIMIT ?`
    )
    .bind(lookbackDate, limit)
    .all<GameVoteCandidateRow>();
  return results ?? [];
}

export async function getGameVoteByKey(
  db: D1Database,
  key: GameVoteKeyFilter,
  lookbackDate: string
): Promise<GameVoteCandidateRow | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `${GAME_VOTE_SELECT}
       AND v.chamber = ? AND v.congress = ? AND v.session = ? AND v.roll_number = ?
       AND v.vote_date >= ?
       LIMIT 1`
    )
    .bind(key.chamber, key.congress, key.session, key.rollNumber, lookbackDate)
    .first<GameVoteCandidateRow>();
  return row ?? null;
}

interface PartyPositionRow {
  party: string | null;
  position: string;
  count: number;
}

function normalizeParty(party: string | null): string {
  if (!party) return "Other";
  const trimmed = party.trim().toUpperCase();
  if (trimmed === "D" || trimmed === "DEM" || trimmed === "DEMOCRAT") return "D";
  if (trimmed === "R" || trimmed === "REP" || trimmed === "REPUBLICAN") return "R";
  if (trimmed === "I" || trimmed === "IND" || trimmed === "INDEPENDENT") return "I";
  return trimmed.slice(0, 12);
}

function isYeaPosition(position: string): boolean {
  const normalized = position.toLowerCase();
  return normalized.includes("yea") || normalized.includes("aye") || normalized === "yes";
}

function isNayPosition(position: string): boolean {
  const normalized = position.toLowerCase();
  return normalized.includes("nay") || normalized.includes("no");
}

export async function getPartySplitForRoll(
  db: D1Database,
  key: GameVoteKeyFilter
): Promise<GamePartySplit[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT m.party, mv.position, COUNT(*) AS count
       FROM member_votes mv
       JOIN members m ON m.bioguide_id = mv.bioguide_id
       WHERE mv.chamber = ? AND mv.congress = ? AND mv.session = ? AND mv.roll_number = ?
       GROUP BY m.party, mv.position`
    )
    .bind(key.chamber, key.congress, key.session, key.rollNumber)
    .all<PartyPositionRow>();

  const byParty = new Map<string, GamePartySplit>();

  for (const row of results ?? []) {
    const party = normalizeParty(row.party);
    const entry = byParty.get(party) ?? { party, yeas: 0, nays: 0 };
    if (isYeaPosition(row.position)) {
      entry.yeas += row.count;
    } else if (isNayPosition(row.position)) {
      entry.nays += row.count;
    }
    byParty.set(party, entry);
  }

  return [...byParty.values()]
    .filter((entry) => entry.yeas > 0 || entry.nays > 0)
    .sort((a, b) => a.party.localeCompare(b.party));
}
