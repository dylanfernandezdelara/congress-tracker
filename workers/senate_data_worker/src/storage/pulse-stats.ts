import type { Chamber, ChamberPulse, CloseVoteEntry, PolicyHeatEntry, ThisWeekSummary } from "../types";
import { ensureSchema } from "../d1/schema";

interface CloseVoteRow {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  bill_type: string;
  bill_number: number;
  yeas: number;
  nays: number;
  margin: number;
  vote_date: string;
  headline: string | null;
}

interface PolicyHeatRow {
  policy_area: string;
  bill_count: number;
}

interface ThisWeekRow {
  count: number;
  headline: string | null;
  bill_type: string | null;
  bill_number: number | null;
  congress: number | null;
}

function emptyPulse(): ChamberPulse {
  return {
    close_votes: [],
    policy_heat: [],
    this_week: { count: 0, headline: null, bill_type: null, bill_number: null, congress: null },
  };
}

async function fetchCloseVotes(
  db: D1Database,
  congress: number,
  session: number,
  chamber: Chamber,
  limit: number
): Promise<CloseVoteEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT v.chamber, v.congress, v.session, v.roll_number,
              v.bill_type, v.bill_number, v.yeas, v.nays,
              ABS(v.yeas - v.nays) AS margin, v.vote_date,
              json_extract(d.digest_json, '$.headline') AS headline
       FROM votes v
       LEFT JOIN bill_digests d
         ON d.congress = v.bill_congress AND d.bill_type = v.bill_type AND d.number = v.bill_number
       WHERE v.congress = ? AND v.session = ? AND v.chamber = ? AND v.is_passage = 1
       ORDER BY margin ASC, v.vote_date DESC
       LIMIT ?`
    )
    .bind(congress, session, chamber, limit)
    .all<CloseVoteRow>();

  return (results ?? []).map((r) => ({
    chamber: r.chamber as Chamber,
    congress: r.congress,
    session: r.session,
    roll_number: r.roll_number,
    bill_type: r.bill_type,
    bill_number: r.bill_number,
    yeas: r.yeas,
    nays: r.nays,
    margin: r.margin,
    vote_date: r.vote_date,
    headline: r.headline,
  }));
}

async function fetchPolicyHeat(
  db: D1Database,
  congress: number,
  session: number,
  chamber: Chamber,
  limit: number
): Promise<PolicyHeatEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT COALESCE(d.policy_area, 'Uncategorized') AS policy_area,
              COUNT(DISTINCT v.bill_type || '-' || CAST(v.bill_number AS TEXT)) AS bill_count
       FROM votes v
       LEFT JOIN bill_digests d
         ON d.congress = v.bill_congress AND d.bill_type = v.bill_type AND d.number = v.bill_number
       WHERE v.congress = ? AND v.session = ? AND v.chamber = ? AND v.is_passage = 1
       GROUP BY policy_area
       ORDER BY bill_count DESC
       LIMIT ?`
    )
    .bind(congress, session, chamber, limit)
    .all<PolicyHeatRow>();

  return results ?? [];
}

async function fetchThisWeek(
  db: D1Database,
  congress: number,
  session: number,
  chamber: Chamber,
  weekStart: string
): Promise<ThisWeekSummary> {
  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM votes
       WHERE congress = ? AND session = ? AND chamber = ? AND is_passage = 1 AND vote_date >= ?`
    )
    .bind(congress, session, chamber, weekStart)
    .first<{ count: number }>();

  const topBill = await db
    .prepare(
      `SELECT v.bill_congress AS congress, v.bill_type, v.bill_number, v.vote_date,
              json_extract(d.digest_json, '$.headline') AS headline
       FROM votes v
       LEFT JOIN bill_digests d
         ON d.congress = v.bill_congress AND d.bill_type = v.bill_type AND d.number = v.bill_number
       WHERE v.congress = ? AND v.session = ? AND v.chamber = ? AND v.is_passage = 1 AND v.vote_date >= ?
       ORDER BY v.vote_date DESC
       LIMIT 1`
    )
    .bind(congress, session, chamber, weekStart)
    .first<{
      congress: number;
      bill_type: string;
      bill_number: number;
      headline: string | null;
    }>();

  return {
    count: countRow?.count ?? 0,
    headline: topBill?.headline ?? null,
    bill_type: topBill?.bill_type ?? null,
    bill_number: topBill?.bill_number ?? null,
    congress: topBill?.congress ?? null,
  };
}

function weekStartIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

async function buildChamberPulse(
  db: D1Database,
  congress: number,
  session: number,
  chamber: Chamber
): Promise<ChamberPulse> {
  const weekStart = weekStartIso();
  const [close_votes, policy_heat, this_week] = await Promise.all([
    fetchCloseVotes(db, congress, session, chamber, 5),
    fetchPolicyHeat(db, congress, session, chamber, 5),
    fetchThisWeek(db, congress, session, chamber, weekStart),
  ]);
  return { close_votes, policy_heat, this_week };
}

export async function buildPulseStats(
  db: D1Database,
  congress: number,
  session: number
): Promise<{ house: ChamberPulse; senate: ChamberPulse }> {
  await ensureSchema(db);
  const [house, senate] = await Promise.all([
    buildChamberPulse(db, congress, session, "House"),
    buildChamberPulse(db, congress, session, "Senate"),
  ]);
  return { house, senate };
}

export { emptyPulse };
