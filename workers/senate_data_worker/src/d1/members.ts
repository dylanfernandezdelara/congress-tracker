import type { MemberRecord } from "../types";
import { isRealBioguideId, senateMemberLookupKey } from "../../../../shared/member-id";
import { normalizePartyCode } from "../../../../shared/party";
import { HOUSE_ROSTER_MIN, SENATE_ROSTER_MIN } from "../constants";
import { readSenateBioguideLookup } from "./pipeline-state";
import { ensureSchema } from "./schema";

export async function upsertMember(db: D1Database, member: MemberRecord): Promise<void> {
  await ensureSchema(db);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO members (bioguide_id, name, chamber, party, state, district, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(bioguide_id) DO UPDATE SET
         name = excluded.name,
         chamber = excluded.chamber,
         party = excluded.party,
         state = excluded.state,
         district = excluded.district,
         updated_at = excluded.updated_at`
    )
    .bind(
      member.bioguideId,
      member.name,
      member.chamber,
      member.party,
      member.state,
      member.district,
      now
    )
    .run();
}

/**
 * Upsert many members in a single atomic D1 batch (one subrequest) instead of
 * one round-trip per member. Each statement stays within the 100-param limit.
 */
export async function upsertMembersBatch(
  db: D1Database,
  members: MemberRecord[],
  options?: { preserveNames?: boolean }
): Promise<void> {
  if (members.length === 0) return;
  await ensureSchema(db);
  const now = new Date().toISOString();
  // preserveNames: vote-XML ingests carry lower-fidelity names (e.g. ASCII-folded
  // "Ben Lujan"), so keep an existing roster name instead of overwriting it.
  const nameUpdate = options?.preserveNames
    ? `COALESCE(NULLIF(members.name, ''), excluded.name)`
    : `excluded.name`;
  const stmt = db.prepare(
    `INSERT INTO members (bioguide_id, name, chamber, party, state, district, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bioguide_id) DO UPDATE SET
       name = ${nameUpdate},
       chamber = excluded.chamber,
       party = excluded.party,
       state = excluded.state,
       district = excluded.district,
       updated_at = excluded.updated_at`
  );
  const batch = members.map((member) =>
    stmt.bind(
      member.bioguideId,
      member.name,
      member.chamber,
      member.party,
      member.state,
      member.district,
      now
    )
  );
  await db.batch(batch);
}

export async function getMember(
  db: D1Database,
  bioguideId: string
): Promise<MemberRecord | null> {
  const map = await getMembersByIds(db, [bioguideId]);
  return map.get(bioguideId) ?? null;
}

// D1 caps bound parameters per query at 100; stay well under so a full
// chamber (House ~435 members) never overflows a single IN (...) lookup.
const ID_LOOKUP_CHUNK = 90;

export async function getMembersByIds(
  db: D1Database,
  bioguideIds: string[]
): Promise<Map<string, MemberRecord>> {
  await ensureSchema(db);
  const unique = [...new Set(bioguideIds)];
  const map = new Map<string, MemberRecord>();
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += ID_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + ID_LOOKUP_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const { results } = await db
      .prepare(
        `SELECT bioguide_id, name, chamber, party, state, district
         FROM members WHERE bioguide_id IN (${placeholders})`
      )
      .bind(...chunk)
      .all<{
        bioguide_id: string;
        name: string;
        chamber: string;
        party: string | null;
        state: string | null;
        district: number | null;
      }>();

    for (const row of results ?? []) {
      map.set(row.bioguide_id, {
        bioguideId: row.bioguide_id,
        name: row.name,
        chamber: row.chamber as MemberRecord["chamber"],
        party: row.party,
        state: row.state,
        district: row.district,
      });
    }
  }

  return map;
}

export interface RealMemberCounts {
  house: number;
  senate: number;
}

/** Count members with real bioguide IDs (excludes LOCAL:* and LIS:* placeholders). */
export async function countRealMembersByChamber(db: D1Database): Promise<RealMemberCounts> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT chamber, COUNT(*) AS seats
       FROM members
       WHERE bioguide_id NOT LIKE 'LOCAL:%'
         AND bioguide_id NOT LIKE 'LIS:%'
       GROUP BY chamber`
    )
    .bind()
    .all<{ chamber: string; seats: number }>();

  let house = 0;
  let senate = 0;
  for (const row of results ?? []) {
    if (row.chamber === "House") house = row.seats;
    if (row.chamber === "Senate") senate = row.seats;
  }
  return { house, senate };
}

export async function hasRealMemberRoster(db: D1Database): Promise<boolean> {
  const counts = await countRealMembersByChamber(db);
  return counts.house >= HOUSE_ROSTER_MIN && counts.senate >= SENATE_ROSTER_MIN;
}

/** Trailing " (D-NJ)" / " (I-ME)" style suffixes from Senate roll-call member_full. */
const SENATE_PARTY_STATE_SUFFIX = /\s*\([A-Za-z]{1,3}-[A-Za-z]{2}\)\s*$/;

/** Generational suffixes, which are never the surname Senate roll-call XML reports. */
const GENERATIONAL_SUFFIX = /^(?:jr|sr|ii|iii|iv|v)$/i;

function trimNameToken(value: string): string {
  return value.replace(/^[,\s]+|[,\s]+$/g, "");
}

/**
 * Last-name strings used as senateMemberLookupKey inputs for a stored display name.
 * Handles clean roster names, "Last, First", and clobbered "Last (P-ST)" vote XML forms.
 *
 * Both comma orderings have to be tried: Congress.gov returns "King, Angus S., Jr.",
 * which the roster stores as the display name "Angus S., Jr. King", so an embedded
 * comma does not mean the surname comes first.
 */
export function senateLastNameCandidates(name: string): string[] {
  const cleaned = name.replace(SENATE_PARTY_STATE_SUFFIX, "").trim();
  if (!cleaned) return [];

  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const trimmed = trimNameToken(value);
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push(trimmed);
  };

  const comma = cleaned.indexOf(",");
  if (comma !== -1) add(cleaned.slice(0, comma));

  const parts = cleaned.split(/\s+/).map(trimNameToken).filter(Boolean);
  while (parts.length > 1 && GENERATIONAL_SUFFIX.test(parts[parts.length - 1]!.replace(/\.$/, ""))) {
    parts.pop();
  }
  for (let i = 1; i <= Math.min(2, parts.length); i += 1) {
    add(parts.slice(-i).join(" "));
  }
  return candidates;
}

/**
 * Map Senate roll-call last name + state + party to bioguide IDs from the members table.
 * Used to replace LIS:* vote keys with real bioguide IDs when the roster is synced.
 */
export async function buildSenateBioguideLookup(db: D1Database): Promise<Map<string, string>> {
  // Prefer rebuilding from synced members when the roster is complete — avoids stale pipeline_state cache.
  if (await hasRealMemberRoster(db)) {
    return buildSenateBioguideLookupFromDb(db);
  }

  const stored = await readSenateBioguideLookup(db);
  if (stored.size > 0) return stored;

  return buildSenateBioguideLookupFromDb(db);
}

async function buildSenateBioguideLookupFromDb(db: D1Database): Promise<Map<string, string>> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT bioguide_id, name, party, state
       FROM members
       WHERE chamber = 'Senate'
         AND bioguide_id NOT LIKE 'LOCAL:%'
         AND bioguide_id NOT LIKE 'LIS:%'`
    )
    .bind()
    .all<{
      bioguide_id: string;
      name: string;
      party: string | null;
      state: string | null;
    }>();

  const lookup = new Map<string, string>();
  for (const row of results ?? []) {
    if (!isRealBioguideId(row.bioguide_id) || !row.state || !row.party) continue;
    const party = normalizePartyCode(row.party);
    if (party === "Other") continue;
    for (const lastName of senateLastNameCandidates(row.name)) {
      lookup.set(senateMemberLookupKey(lastName, row.state, party), row.bioguide_id);
    }
  }
  return lookup;
}

/** Remove LOCAL:* and LIS:* placeholder rows superseded by a real roster sync. */
export async function deletePlaceholderMemberIds(db: D1Database): Promise<void> {
  await ensureSchema(db);
  await db
    .prepare(`DELETE FROM members WHERE bioguide_id LIKE 'LOCAL:%' OR bioguide_id LIKE 'LIS:%'`)
    .bind()
    .run();
}
