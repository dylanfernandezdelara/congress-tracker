import type { Env } from "../config";
import type { Chamber, IngestVotesResult, SenateIngestVotesResult } from "../types";
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

/** Truncation and source-ahead watermarks — not fetch errors from the chamber client. */
function ingestIntegrityWarnings(chamber: Chamber, result: IngestVotesResult): string[] {
  const warnings: string[] = [];
  if (result.truncated) {
    warnings.push(
      `${chamber} ingest truncated: per-run fetch cap reached; remaining unknown rolls retry next run (newest first).`
    );
  }
  const source = result.sourceLatestDate;
  const covered = result.coveredLatestDate;
  if (source && !(covered && source <= covered)) {
    warnings.push(
      `${chamber} source listed latest ${source} is newer than stored ${covered ?? "none"}`
    );
  }
  return warnings;
}

function settleChamber<T extends IngestVotesResult>(
  settled: PromiseSettledResult<T>,
  chamber: Chamber,
  empty: () => T
): { result: T; warnings: string[] } {
  if (settled.status === "rejected") {
    const message = errorMessage(settled.reason);
    console.warn(
      JSON.stringify({
        event: `${chamber.toLowerCase()}_ingest_failed`,
        error: message,
      })
    );
    return {
      result: empty(),
      warnings: [`${chamber} ingest skipped: ${message}`],
    };
  }
  const result = settled.value;
  return {
    result,
    warnings: [...(result.warnings ?? []), ...ingestIntegrityWarnings(chamber, result)],
  };
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

  const house = settleChamber(houseSettled, "House", emptyHouseResult);
  const senate = settleChamber(senateSettled, "Senate", emptySenateResult);

  if (houseSettled.status === "rejected" && senateSettled.status === "rejected") {
    throw new Error(
      `House ingest failed: ${errorMessage(houseSettled.reason)}; Senate ingest failed: ${errorMessage(senateSettled.reason)}`
    );
  }

  return {
    house: house.result,
    senate: senate.result,
    chamberWarnings: [...house.warnings, ...senate.warnings],
  };
}
