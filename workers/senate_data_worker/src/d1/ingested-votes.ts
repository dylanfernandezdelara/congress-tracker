import type { VoteDetails } from "../xml";
import { ensurePlatformSchema } from "./schema";

export async function readKnownVoteNumbersFromD1(
  db: D1Database,
  congress: number,
  session: number
): Promise<Set<number>> {
  await ensurePlatformSchema(db);
  const numbers = new Set<number>();

  const ingested = await db
    .prepare(
      `SELECT vote_number
      FROM ingested_vote_details
      WHERE congress = ? AND session = ?`
    )
    .bind(congress, session)
    .all<Record<string, unknown>>();
  for (const row of ingested.results ?? []) {
    const voteNumber = Number(row.vote_number);
    if (Number.isInteger(voteNumber)) numbers.add(voteNumber);
  }

  return numbers;
}

export async function readIngestedVoteDetailsFromD1(
  db: D1Database,
  congress: number,
  session: number,
  voteNumbers?: Iterable<number>
): Promise<Map<number, VoteDetails>> {
  await ensurePlatformSchema(db);
  const requested = voteNumbers ? new Set(voteNumbers) : null;
  if (requested && requested.size === 0) return new Map();

  const result = await db
    .prepare(
      `SELECT vote_number, payload_json
      FROM ingested_vote_details
      WHERE congress = ? AND session = ?`
    )
    .bind(congress, session)
    .all<Record<string, unknown>>();

  const details = new Map<number, VoteDetails>();
  for (const row of result.results ?? []) {
    const voteNumber = Number(row.vote_number);
    if (!Number.isInteger(voteNumber)) continue;
    if (requested && !requested.has(voteNumber)) continue;
    try {
      details.set(voteNumber, JSON.parse(String(row.payload_json)) as VoteDetails);
    } catch {
      console.warn(`[d1] Ignoring malformed ingested vote detail ${congress}/${session}/${voteNumber}`);
    }
  }
  return details;
}

export async function writeIngestedVoteDetailsToD1(
  db: D1Database,
  details: VoteDetails[]
): Promise<void> {
  if (details.length === 0) return;
  await ensurePlatformSchema(db);
  const now = new Date().toISOString();

  for (const detail of details) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO ingested_vote_details (
          congress, session, vote_number, vote_date, payload_json, source, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        detail.congress,
        detail.session,
        detail.vote_number,
        detail.vote_date,
        JSON.stringify(detail),
        "senate_xml",
        now
      )
      .run();
  }
}
