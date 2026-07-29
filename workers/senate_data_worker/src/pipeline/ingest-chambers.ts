import type { Env } from "../config";
import type { IngestVotesResult, SenateIngestVotesResult } from "../types";
import { ingestHousePassageVotes } from "../sources/house-votes";
import { ingestSenatePassageVotes } from "../sources/senate-votes";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function emptyHouseResult(): IngestVotesResult {
  return { votes: [], skipped: 0 };
}

function emptySenateResult(): SenateIngestVotesResult {
  return { votes: [], skipped: 0, confirmationVotes: [] };
}

export interface ChamberIngestResult {
  house: IngestVotesResult;
  senate: SenateIngestVotesResult;
  chamberWarnings: string[];
}

/**
 * Ingest House and Senate passage votes independently so a single-chamber
 * outage does not block the other chamber's vote upserts. Soft-fails per
 * chamber (warning + empty votes); throws only when both chambers fail.
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

  let house: IngestVotesResult;
  if (houseSettled.status === "rejected") {
    const message = errorMessage(houseSettled.reason);
    chamberWarnings.push(`House ingest skipped: ${message}`);
    console.warn(
      JSON.stringify({
        event: "house_ingest_failed",
        error: message,
      })
    );
    house = emptyHouseResult();
  } else {
    house = houseSettled.value;
    if (house.warnings?.length) {
      chamberWarnings.push(...house.warnings);
    }
  }

  let senate: SenateIngestVotesResult;
  if (senateSettled.status === "rejected") {
    const message = errorMessage(senateSettled.reason);
    chamberWarnings.push(`Senate ingest skipped: ${message}`);
    console.warn(
      JSON.stringify({
        event: "senate_ingest_failed",
        error: message,
      })
    );
    senate = emptySenateResult();
  } else {
    senate = senateSettled.value;
    if (senate.warnings?.length) {
      chamberWarnings.push(...senate.warnings);
    }
  }

  if (houseSettled.status === "rejected" && senateSettled.status === "rejected") {
    throw new Error(
      `House ingest failed: ${errorMessage(houseSettled.reason)}; Senate ingest failed: ${errorMessage(senateSettled.reason)}`
    );
  }

  return { house, senate, chamberWarnings };
}
