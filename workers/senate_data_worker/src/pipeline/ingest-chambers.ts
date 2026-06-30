import type { Env } from "../config";
import type { IngestVotesResult } from "../types";
import { ingestHousePassageVotes } from "../sources/house-votes";
import { ingestSenatePassageVotes } from "../sources/senate-votes";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface ChamberIngestResult {
  house: IngestVotesResult;
  senate: IngestVotesResult;
  chamberWarnings: string[];
}

/**
 * Ingest House and Senate passage votes independently so a Senate.gov outage
 * does not block House vote upserts.
 */
export async function ingestPassageVotesByChamber(
  env: Env,
  lookbackStart: string | null,
  knownKeys: ReadonlySet<string>,
  options: { houseMaxNewVotes?: number } = {}
): Promise<ChamberIngestResult> {
  const [houseSettled, senateSettled] = await Promise.allSettled([
    ingestHousePassageVotes(env, lookbackStart, knownKeys, options.houseMaxNewVotes),
    ingestSenatePassageVotes(env, lookbackStart, knownKeys),
  ]);

  const chamberWarnings: string[] = [];

  if (houseSettled.status === "rejected") {
    const message = errorMessage(houseSettled.reason);
    if (senateSettled.status === "rejected") {
      throw new Error(`House ingest failed: ${message}; Senate ingest failed: ${errorMessage(senateSettled.reason)}`);
    }
    throw new Error(`House ingest failed: ${message}`);
  }

  const house = houseSettled.value;

  if (senateSettled.status === "rejected") {
    const message = errorMessage(senateSettled.reason);
    chamberWarnings.push(`Senate ingest skipped: ${message}`);
    console.warn(
      JSON.stringify({
        event: "senate_ingest_failed",
        error: message,
      })
    );
    return { house, senate: { votes: [], skipped: 0 }, chamberWarnings };
  }

  return { house, senate: senateSettled.value, chamberWarnings };
}
