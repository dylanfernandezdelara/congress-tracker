import {
  PROCESS_MAX_COMMITTEE_LIST_PAGES_PER_RUN,
  PROCESS_MAX_HYDRATIONS_PER_RUN,
  PROCESS_RATELIMIT_STOP_REMAINING,
} from "../constants";
import { congressNumber, type Env } from "../config";
import {
  countProcessQueuePending,
  enqueueProcessBills,
  selectKnownProcessCandidateBills,
  selectProcessQueueBatch,
  selectStandingCommittees,
  upsertCommitteeRoster,
  type ProcessBillKey,
} from "../d1/bill-process";
import { getPipelineState, setPipelineState } from "../d1/pipeline-state";
import {
  fetchCommitteeBillsPage,
  fetchCongressCommitteeRoster,
} from "../sources/congress-client";
import { HttpResponseError } from "../sources/http";
import { hydrateProcessBills } from "./refresh-bill-process";

const DISCOVERY_STATE_KEY = "process_committee_discovery";

interface DiscoveryState {
  chamber: "House" | "Senate";
  systemCode: string;
  offset: number;
  fromDateTime: string;
}

function congressStartFromDateTime(congress: number): string {
  const year = 1789 + (congress - 1) * 2;
  return `${year}-01-01T00:00:00Z`;
}

export interface ProcessBackfillResult {
  roster_upserted: number;
  discovered: number;
  hydrated: number;
  skipped: number;
  bills_remaining: number;
  list_pages_fetched: number;
  stopped_for_rate_limit: boolean;
  warnings: string[];
}

async function ensureRoster(env: Env, congress: number): Promise<number> {
  const existingHouse = await selectStandingCommittees(env.DB, congress, "House");
  const existingSenate = await selectStandingCommittees(env.DB, congress, "Senate");
  if (existingHouse.length > 0 && existingSenate.length > 0) {
    return 0;
  }
  const rows = await fetchCongressCommitteeRoster(env, congress);
  await upsertCommitteeRoster(
    env.DB,
    rows.map((r) => ({
      congress,
      systemCode: r.systemCode,
      chamber: r.chamber,
      name: r.name,
      committeeType: r.committeeType,
      parentSystemCode: r.parentSystemCode,
    }))
  );
  return rows.length;
}

async function discoverFromCommitteeLists(
  env: Env,
  congress: number,
  maxPages: number
): Promise<{
  discovered: number;
  pages: number;
  stoppedForRateLimit: boolean;
  warnings: string[];
}> {
  const warnings: string[] = [];
  let discovered = 0;
  let pages = 0;
  let stoppedForRateLimit = false;

  const house = await selectStandingCommittees(env.DB, congress, "House");
  const senate = await selectStandingCommittees(env.DB, congress, "Senate");
  const standing = [...house, ...senate];
  if (standing.length === 0) {
    warnings.push("No standing committees in roster; skip list discovery");
    return { discovered, pages, stoppedForRateLimit, warnings };
  }

  const fromDateTime = congressStartFromDateTime(congress);
  const stored = await getPipelineState<DiscoveryState>(env.DB, DISCOVERY_STATE_KEY);

  let idx = 0;
  let offset = 0;
  if (stored?.systemCode) {
    const found = standing.findIndex(
      (c) => c.chamber === stored.chamber && c.system_code === stored.systemCode
    );
    if (found >= 0) {
      idx = found;
      offset = stored.offset ?? 0;
    }
  }

  while (pages < maxPages && idx < standing.length) {
    const committee = standing[idx]!;
    try {
      const page = await fetchCommitteeBillsPage(env, {
        chamber: committee.chamber === "House" ? "house" : "senate",
        systemCode: committee.system_code,
        fromDateTime,
        offset,
        limit: 250,
      });
      pages += 1;

      const bills: ProcessBillKey[] = page.bills
        .filter((b) => b.congress === congress)
        .map((b) => ({
          congress: b.congress,
          billType: b.type,
          billNumber: b.number,
        }));
      discovered += await enqueueProcessBills(env.DB, bills);

      if (page.nextOffset == null) {
        idx += 1;
        offset = 0;
      } else {
        offset = page.nextOffset;
      }

      // Finish the paid-for page, then stop before the next request.
      if (
        page.rateLimitRemaining != null &&
        page.rateLimitRemaining < PROCESS_RATELIMIT_STOP_REMAINING
      ) {
        stoppedForRateLimit = true;
        warnings.push(
          `Stopping committee-list discovery early: rate limit remaining=${page.rateLimitRemaining}`
        );
        await setPipelineState(env.DB, DISCOVERY_STATE_KEY, {
          chamber: committee.chamber,
          systemCode: committee.system_code,
          offset,
          fromDateTime,
        } satisfies DiscoveryState);
        break;
      }
    } catch (err) {
      if (err instanceof HttpResponseError && err.status === 429) {
        stoppedForRateLimit = true;
        warnings.push("Congress.gov rate limited during committee-list discovery");
        await setPipelineState(env.DB, DISCOVERY_STATE_KEY, {
          chamber: committee.chamber,
          systemCode: committee.system_code,
          offset,
          fromDateTime,
        } satisfies DiscoveryState);
        break;
      }
      warnings.push(
        `Committee list fetch failed for ${committee.chamber} ${committee.system_code}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      idx += 1;
      offset = 0;
    }
  }

  if (idx >= standing.length) {
    await setPipelineState(env.DB, DISCOVERY_STATE_KEY, {
      chamber: standing[0]!.chamber,
      systemCode: standing[0]!.system_code,
      offset: 0,
      fromDateTime,
    } satisfies DiscoveryState);
  } else if (!stoppedForRateLimit) {
    const committee = standing[idx]!;
    await setPipelineState(env.DB, DISCOVERY_STATE_KEY, {
      chamber: committee.chamber,
      systemCode: committee.system_code,
      offset,
      fromDateTime,
    } satisfies DiscoveryState);
  }

  return { discovered, pages, stoppedForRateLimit, warnings };
}

export async function runProcessBackfillPipeline(
  env: Env
): Promise<ProcessBackfillResult> {
  const congress = congressNumber(env);
  const warnings: string[] = [];

  let rosterUpserted = 0;
  try {
    rosterUpserted = await ensureRoster(env, congress);
  } catch (err) {
    warnings.push(
      `Committee roster refresh failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  let discovered = 0;
  try {
    const known = await selectKnownProcessCandidateBills(env.DB, congress, 500);
    discovered += await enqueueProcessBills(env.DB, known);
  } catch (err) {
    warnings.push(
      `Known-bill discovery failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const list = await discoverFromCommitteeLists(
    env,
    congress,
    PROCESS_MAX_COMMITTEE_LIST_PAGES_PER_RUN
  );
  discovered += list.discovered;
  warnings.push(...list.warnings);

  const batch = await selectProcessQueueBatch(env.DB, PROCESS_MAX_HYDRATIONS_PER_RUN);
  const hydrate = await hydrateProcessBills(env, batch);
  warnings.push(...hydrate.warnings);

  const billsRemaining = await countProcessQueuePending(env.DB);

  return {
    roster_upserted: rosterUpserted,
    discovered,
    hydrated: hydrate.refreshed,
    skipped: hydrate.skipped,
    bills_remaining: billsRemaining,
    list_pages_fetched: list.pages,
    stopped_for_rate_limit: list.stoppedForRateLimit || hydrate.stoppedForRateLimit,
    warnings,
  };
}
