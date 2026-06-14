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

export async function getMember(
  db: D1Database,
  bioguideId: string
): Promise<MemberRecord | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(
      `SELECT bioguide_id, name, chamber, party, state, district
       FROM members WHERE bioguide_id = ?`
    )
    .bind(bioguideId)
    .first<{
      bioguide_id: string;
      name: string;
      chamber: string;
      party: string | null;
      state: string | null;
      district: number | null;
    }>();

  if (!row) return null;
  return {
    bioguideId: row.bioguide_id,
    name: row.name,
    chamber: row.chamber as MemberRecord["chamber"],
    party: row.party,
    state: row.state,
    district: row.district,
  };
}
