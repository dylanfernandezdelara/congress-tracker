import type { ChamberStats, DateRange } from "../types";
import { ensureSchema } from "../d1/schema";
import { buildChamberComposition, emptyChamberComposition } from "./chamber-composition";

interface ChamberAggRow {
  chamber: string;
  passage_vote_count: number;
  unique_bills_passed: number;
  avg_margin: number | null;
  closest_margin: number | null;
  first_date: string | null;
  last_date: string | null;
}

function emptyChamberStats(): ChamberStats {
  return {
    passage_vote_count: 0,
    unique_bills_passed: 0,
    avg_margin: 0,
    closest_margin: 0,
    date_range: { first: null, last: null },
    coverage_days: 0,
  };
}

function coverageDays(first: string | null, last: string | null): number {
  if (!first || !last) return 0;
  const start = Date.parse(`${first}T00:00:00Z`);
  const end = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function rowToStats(row: ChamberAggRow | undefined): ChamberStats {
  if (!row) return emptyChamberStats();
  const dateRange: DateRange = {
    first: row.first_date,
    last: row.last_date,
  };
  return {
    passage_vote_count: row.passage_vote_count,
    unique_bills_passed: row.unique_bills_passed,
    avg_margin: row.avg_margin ?? 0,
    closest_margin: row.closest_margin ?? 0,
    date_range: dateRange,
    coverage_days: coverageDays(row.first_date, row.last_date),
  };
}

export async function buildSessionStats(
  db: D1Database,
  congress: number,
  session: number
): Promise<{
  house: ChamberStats;
  senate: ChamberStats;
  composition: Awaited<ReturnType<typeof buildChamberComposition>>;
}> {
  await ensureSchema(db);
  const [{ results }, compositionResult] = await Promise.all([
    db
      .prepare(
        `SELECT chamber,
                COUNT(*) AS passage_vote_count,
                COUNT(DISTINCT bill_type || '-' || CAST(bill_number AS TEXT)) AS unique_bills_passed,
                AVG(ABS(yeas - nays)) AS avg_margin,
                MIN(ABS(yeas - nays)) AS closest_margin,
                MIN(vote_date) AS first_date,
                MAX(vote_date) AS last_date
         FROM votes
         WHERE congress = ? AND session = ? AND is_passage = 1
         GROUP BY chamber`
      )
      .bind(congress, session)
      .all<ChamberAggRow>(),
    buildChamberComposition(db, congress, session).catch(() => emptyChamberComposition(congress)),
  ]);
  const composition = compositionResult;

  const byChamber = new Map((results ?? []).map((r) => [r.chamber, r]));
  return {
    house: rowToStats(byChamber.get("House")),
    senate: rowToStats(byChamber.get("Senate")),
    composition,
  };
}
