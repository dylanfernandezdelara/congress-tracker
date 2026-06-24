import { seatsUpForElection } from "../../../../shared/chamber-election";
import { chamberControlLabel, normalizePartyCode } from "../../../../shared/party";
import { HOUSE_ROSTER_MIN, SENATE_ROSTER_MIN } from "../constants";
import type { ChamberComposition, PartySeatCount } from "../types";
import { countRealMembersByChamber, hasRealMemberRoster } from "../d1/members";
import { ensureSchema } from "../d1/schema";

interface MemberPartyRow {
  chamber: string;
  party: string | null;
  seats: number;
}

interface RollVoteCountRow {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  vote_count: number;
}

const PARTY_ORDER = ["R", "D", "I", "Other"];

/** Minimum seats to treat a roll as a full chamber roster snapshot. */

function sortSeats(seats: PartySeatCount[]): PartySeatCount[] {
  return [...seats].sort((a, b) => {
    const ai = PARTY_ORDER.indexOf(a.party);
    const bi = PARTY_ORDER.indexOf(b.party);
    const aRank = ai === -1 ? PARTY_ORDER.length : ai;
    const bRank = bi === -1 ? PARTY_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return b.seats - a.seats;
  });
}

function toComposition(
  partyMap: Map<string, number> | undefined,
  chamber: "House" | "Senate",
  congress: number,
  options?: { isSample?: boolean; seatParties?: string[] }
): ChamberComposition {
  const election = seatsUpForElection(chamber, congress);

  if (!partyMap || partyMap.size === 0) {
    return {
      seats: [],
      total: 0,
      majority_party: null,
      control_label: chamberControlLabel(null, 0),
      is_sample: false,
      ...election,
    };
  }

  const seats = sortSeats(
    [...partyMap.entries()].map(([party, count]) => ({ party, seats: count }))
  );
  const total = seats.reduce((sum, entry) => sum + entry.seats, 0);
  const leading = [...seats].sort((a, b) => b.seats - a.seats)[0];
  const majorityParty = leading && leading.seats > total / 2 ? leading.party : null;

  const seatParties =
    options?.seatParties && options.seatParties.length === total
      ? options.seatParties
      : undefined;

  return {
    seats,
    total,
    majority_party: majorityParty,
    control_label: chamberControlLabel(majorityParty, total),
    ...(seatParties ? { seat_parties: seatParties } : {}),
    ...election,
    ...(options?.isSample ? { is_sample: true } : {}),
  };
}

function aggregatePartyRows(rows: MemberPartyRow[]): Map<string, number> {
  const partyMap = new Map<string, number>();
  for (const row of rows) {
    const party = normalizePartyCode(row.party);
    partyMap.set(party, (partyMap.get(party) ?? 0) + row.seats);
  }
  return partyMap;
}

async function listRollMemberPartyCodes(
  db: D1Database,
  roll: RollVoteCountRow,
  excludeLocalSample: boolean
): Promise<string[]> {
  const localFilter = excludeLocalSample
    ? " AND m.bioguide_id NOT LIKE 'LOCAL:%' AND m.bioguide_id NOT LIKE 'LIS:%'"
    : "";
  const { results } = await db
    .prepare(
      `SELECT m.party
       FROM member_votes mv
       JOIN members m ON m.bioguide_id = mv.bioguide_id
       WHERE mv.chamber = ?
         AND mv.congress = ?
         AND mv.session = ?
         AND mv.roll_number = ?${localFilter}
       ORDER BY m.state, m.district IS NULL, m.district, m.name`
    )
    .bind(roll.chamber, roll.congress, roll.session, roll.roll_number)
    .all<{ party: string | null }>();
  return (results ?? []).map((row) => normalizePartyCode(row.party));
}

function seatPartiesMatchPartyMap(
  seatParties: string[],
  partyMap: Map<string, number>
): boolean {
  const total = [...partyMap.values()].reduce((sum, count) => sum + count, 0);
  if (seatParties.length !== total) return false;

  const histogram = new Map<string, number>();
  for (const party of seatParties) {
    histogram.set(party, (histogram.get(party) ?? 0) + 1);
  }
  for (const [party, count] of partyMap) {
    if ((histogram.get(party) ?? 0) !== count) return false;
  }
  return true;
}

async function listMemberPartyCodes(
  db: D1Database,
  chamber: string,
  excludeLocalSample: boolean
): Promise<string[]> {
  const localFilter = excludeLocalSample
    ? " AND bioguide_id NOT LIKE 'LOCAL:%' AND bioguide_id NOT LIKE 'LIS:%'"
    : "";
  const { results } = await db
    .prepare(
      `SELECT party
       FROM members
       WHERE chamber = ?${localFilter}
       ORDER BY state, district IS NULL, district, name`
    )
    .bind(chamber)
    .all<{ party: string | null }>();
  return (results ?? []).map((row) => normalizePartyCode(row.party));
}

async function countMembersByParty(
  db: D1Database,
  chamber: string,
  excludeLocalSample: boolean
): Promise<Map<string, number>> {
  const localFilter = excludeLocalSample
    ? " AND bioguide_id NOT LIKE 'LOCAL:%' AND bioguide_id NOT LIKE 'LIS:%'"
    : "";
  const { results } = await db
    .prepare(
      `SELECT chamber, party, COUNT(*) AS seats
       FROM members
       WHERE chamber = ?${localFilter}
       GROUP BY chamber, party`
    )
    .bind(chamber)
    .all<MemberPartyRow>();
  return aggregatePartyRows(results ?? []);
}

async function findLargestRollForChamber(
  db: D1Database,
  congress: number,
  session: number,
  chamber: string
): Promise<RollVoteCountRow | null> {
  const row = await db
    .prepare(
      `SELECT chamber, congress, session, roll_number, COUNT(*) AS vote_count
       FROM member_votes
       WHERE congress = ? AND session = ? AND chamber = ?
       GROUP BY chamber, congress, session, roll_number
       ORDER BY vote_count DESC
       LIMIT 1`
    )
    .bind(congress, session, chamber)
    .first<RollVoteCountRow>();
  return row ?? null;
}

async function countRollRosterByParty(
  db: D1Database,
  roll: RollVoteCountRow,
  excludeLocalSample: boolean
): Promise<Map<string, number>> {
  const localFilter = excludeLocalSample
    ? " AND m.bioguide_id NOT LIKE 'LOCAL:%' AND m.bioguide_id NOT LIKE 'LIS:%'"
    : "";
  const { results } = await db
    .prepare(
      `SELECT mv.chamber, m.party, COUNT(*) AS seats
       FROM member_votes mv
       JOIN members m ON m.bioguide_id = mv.bioguide_id
       WHERE mv.chamber = ?
         AND mv.congress = ?
         AND mv.session = ?
         AND mv.roll_number = ?${localFilter}
       GROUP BY mv.chamber, m.party`
    )
    .bind(roll.chamber, roll.congress, roll.session, roll.roll_number)
    .all<MemberPartyRow>();
  return aggregatePartyRows(results ?? []);
}

function rosterMinForChamber(chamber: string): number {
  return chamber === "House" ? HOUSE_ROSTER_MIN : SENATE_ROSTER_MIN;
}

async function buildChamberCompositionForChamber(
  db: D1Database,
  congress: number,
  session: number,
  chamber: "House" | "Senate",
  excludeLocalSample: boolean
): Promise<ChamberComposition> {
  const largestRoll = await findLargestRollForChamber(db, congress, session, chamber);
  const rosterMin = rosterMinForChamber(chamber);

  if (largestRoll && largestRoll.vote_count >= rosterMin) {
    const partyMap = await countRollRosterByParty(db, largestRoll, excludeLocalSample);
    const rosterTotal = [...partyMap.values()].reduce((sum, count) => sum + count, 0);
    if (rosterTotal >= rosterMin) {
      const seatParties = await listRollMemberPartyCodes(db, largestRoll, excludeLocalSample);
      return toComposition(partyMap, chamber, congress, {
        seatParties: seatPartiesMatchPartyMap(seatParties, partyMap)
          ? seatParties
          : undefined,
      });
    }
  }

  const memberPartyMap = await countMembersByParty(db, chamber, excludeLocalSample);
  const total = [...memberPartyMap.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    return toComposition(undefined, chamber, congress);
  }

  const isSample = total < rosterMin;
  const seatParties = await listMemberPartyCodes(db, chamber, excludeLocalSample);
  return toComposition(memberPartyMap, chamber, congress, {
    isSample,
    seatParties: seatPartiesMatchPartyMap(seatParties, memberPartyMap)
      ? seatParties
      : undefined,
  });
}

export async function buildChamberComposition(
  db: D1Database,
  congress: number,
  session: number
): Promise<{ house: ChamberComposition; senate: ChamberComposition }> {
  await ensureSchema(db);
  const excludeLocalSample = await hasRealMemberRoster(db);
  const [house, senate] = await Promise.all([
    buildChamberCompositionForChamber(db, congress, session, "House", excludeLocalSample),
    buildChamberCompositionForChamber(db, congress, session, "Senate", excludeLocalSample),
  ]);
  return { house, senate };
}

export function emptyChamberComposition(congress = 119): {
  house: ChamberComposition;
  senate: ChamberComposition;
} {
  return {
    house: toComposition(undefined, "House", congress),
    senate: toComposition(undefined, "Senate", congress),
  };
}
