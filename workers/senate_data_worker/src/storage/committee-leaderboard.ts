import type {
  CommitteeLeaderboardRow,
  CommitteesLeaderboardResponse,
  StatsChamber,
} from "../../../../shared/stats-api-types";
import { PROCESS_STUCK_DAYS } from "../constants";
import type { Env } from "../config";
import { ensureSchema } from "../d1/schema";
import { lookbackStartIso } from "../sources/congress-client";

const PULSE_WAITING_LIMIT = 5;

interface WaitingSqlRow {
  system_code: string;
  name: string;
  waiting: number;
}

/**
 * Standing-committee waiting counts in SQL: referred (`sent`) with no
 * `advanced`/`released`, and earliest send at or before `stuckSince`.
 */
export async function selectStandingWaitingRows(
  db: D1Database,
  congress: number,
  chamber: StatsChamber,
  stuckSince: string
): Promise<CommitteeLeaderboardRow[]> {
  await ensureSchema(db);
  const { results } = await db
    .prepare(
      `SELECT r.system_code AS system_code,
              r.name AS name,
              COUNT(w.bill_number) AS waiting
       FROM committee_roster r
       LEFT JOIN (
         SELECT system_code, bill_type, bill_number
         FROM bill_committee_events
         WHERE congress = ?
           AND activity_key IN ('sent', 'advanced', 'released')
         GROUP BY system_code, bill_type, bill_number
         HAVING MIN(CASE WHEN activity_key = 'sent' THEN activity_at END) IS NOT NULL
            AND MIN(CASE WHEN activity_key = 'sent' THEN activity_at END) <= ?
            AND MAX(CASE WHEN activity_key IN ('advanced', 'released') THEN 1 ELSE 0 END) = 0
       ) w ON w.system_code = r.system_code
       WHERE r.congress = ?
         AND r.chamber = ?
         AND r.parent_system_code IS NULL
         AND r.committee_type = 'Standing'
       GROUP BY r.system_code, r.name
       ORDER BY waiting DESC, r.name ASC`
    )
    .bind(congress, stuckSince, congress, chamber)
    .all<WaitingSqlRow>();

  return (results ?? []).map((row) => ({
    system_code: row.system_code,
    name: row.name,
    chamber,
    waiting: Number(row.waiting) || 0,
  }));
}

export async function waitingInCommitteeForPulse(
  db: D1Database,
  congress: number,
  chamber: StatsChamber,
  asOf: string = new Date().toISOString()
): Promise<CommitteeLeaderboardRow[]> {
  const stuckSince = `${lookbackStartIso(PROCESS_STUCK_DAYS, new Date(asOf))}T00:00:00.000Z`;
  const rows = await selectStandingWaitingRows(db, congress, chamber, stuckSince);
  return rows.filter((row) => row.waiting > 0).slice(0, PULSE_WAITING_LIMIT);
}

export async function buildCommitteesLeaderboard(
  env: Env,
  congress: number,
  session: number,
  chamber: StatsChamber,
  asOf: string = new Date().toISOString()
): Promise<CommitteesLeaderboardResponse> {
  const stuckSince = `${lookbackStartIso(PROCESS_STUCK_DAYS, new Date(asOf))}T00:00:00.000Z`;
  const items = await selectStandingWaitingRows(env.DB, congress, chamber, stuckSince);
  return {
    congress,
    session,
    chamber,
    items,
    as_of: asOf,
  };
}
