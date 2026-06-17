import type { MemberRecord } from "../types";
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
  members: MemberRecord[]
): Promise<void> {
  if (members.length === 0) return;
  await ensureSchema(db);
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO members (bioguide_id, name, chamber, party, state, district, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(bioguide_id) DO UPDATE SET
       name = excluded.name,
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
