import type { FeedChamber } from "../../../../shared/feed-api-types";
import { asFeedChamber } from "../sources/congress-client";
import { ensureSchema } from "./schema";

export interface CommitteeRosterRow {
  congress: number;
  system_code: string;
  chamber: FeedChamber;
  name: string;
  committee_type: string;
  parent_system_code: string | null;
}

export async function upsertCommitteeRoster(
  db: D1Database,
  rows: Array<{
    congress: number;
    systemCode: string;
    chamber: FeedChamber;
    name: string;
    committeeType: string;
    parentSystemCode: string | null;
  }>
): Promise<void> {
  await ensureSchema(db);
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const stmts = rows.map((r) =>
    db
      .prepare(
        `INSERT INTO committee_roster (
          congress, system_code, chamber, name, committee_type, parent_system_code, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(congress, system_code) DO UPDATE SET
          chamber = excluded.chamber,
          name = excluded.name,
          committee_type = excluded.committee_type,
          parent_system_code = excluded.parent_system_code,
          updated_at = excluded.updated_at`
      )
      .bind(
        r.congress,
        r.systemCode,
        r.chamber,
        r.name,
        r.committeeType,
        r.parentSystemCode,
        now
      )
  );
  await db.batch(stmts);
}

export async function getCommitteeNameMap(
  db: D1Database,
  congress: number
): Promise<Map<string, string>> {
  await ensureSchema(db);
  const rows = await db
    .prepare(`SELECT system_code, name FROM committee_roster WHERE congress = ?`)
    .bind(congress)
    .all<{ system_code: string; name: string }>();
  const map = new Map<string, string>();
  for (const r of rows.results ?? []) {
    map.set(r.system_code, r.name);
  }
  return map;
}

export async function selectStandingCommittees(
  db: D1Database,
  congress: number,
  chamber: FeedChamber
): Promise<CommitteeRosterRow[]> {
  await ensureSchema(db);
  const rows = await db
    .prepare(
      `SELECT congress, system_code, chamber, name, committee_type, parent_system_code
       FROM committee_roster
       WHERE congress = ? AND chamber = ? AND parent_system_code IS NULL
         AND committee_type = 'Standing'
       ORDER BY name ASC`
    )
    .bind(congress, chamber)
    .all<{
      congress: number;
      system_code: string;
      chamber: string;
      name: string;
      committee_type: string;
      parent_system_code: string | null;
    }>();
  return (rows.results ?? [])
    .map((r) => {
      const ch = asFeedChamber(r.chamber);
      if (!ch) return null;
      return {
        congress: r.congress,
        system_code: r.system_code,
        chamber: ch,
        name: r.name,
        committee_type: r.committee_type,
        parent_system_code: r.parent_system_code,
      };
    })
    .filter((r): r is CommitteeRosterRow => r !== null);
}
