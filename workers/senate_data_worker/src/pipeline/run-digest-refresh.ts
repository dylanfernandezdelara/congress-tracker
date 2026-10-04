import { DIGEST_REFRESH_MAX_BILLS } from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import { settleJob } from "../d1/digest-jobs";
import { replaceBillSponsors } from "../d1/sponsors";
import { prepareBill } from "../digest/prepare";
import { writeSummary } from "../digest/write";
import { parseBillQueryList } from "../sources/parse-bill-query";
import type { BillRef } from "../types";

export interface DigestRefreshFailure {
  bill: string;
  reason: string;
}

export interface RunDigestRefreshResult {
  requested: number;
  refreshed: number;
  skipped: number;
  /** Models that wrote the stored summaries. */
  models: string[];
  costUsd: number;
  failures: DigestRefreshFailure[];
}

function formatBillKey(bill: BillRef): string {
  return `${bill.type}${bill.number}`;
}

/**
 * Admin: rewrite named bills now, through the same writer as the hourly sweep (Sonnet; Luna for giant bills),
 * whatever their fingerprint. Counts against the daily budget.
 */
export async function runDigestRefreshPipeline(env: Env, bills: BillRef[]): Promise<RunDigestRefreshResult> {
  const limited = bills.slice(0, DIGEST_REFRESH_MAX_BILLS);
  const failures: DigestRefreshFailure[] = [];
  const models = new Set<string>();
  let refreshed = 0;
  let skipped = 0;
  let costUsd = 0;

  for (const bill of limited) {
    const key = formatBillKey(bill);
    try {
      const prepared = await prepareBill(env, bill);
      await replaceBillSponsors(env.DB, bill, prepared.bundle.sponsors);
      const outcome = await writeSummary(env, prepared, "rewrite");
      costUsd += outcome.cost;
      if (outcome.status === "stored") {
        refreshed += 1;
        models.add(outcome.model);
        await settleJob(env.DB, bill, "done");
        continue;
      }
      skipped += 1;
      failures.push({
        bill: key,
        reason:
          outcome.status === "rejected"
            ? `rejected: ${outcome.reasons.join("; ")}`
            : outcome.status === "failed"
              ? outcome.reason
              : (outcome.reason ?? "daily budget spent"),
      });
    } catch (err) {
      skipped += 1;
      failures.push({ bill: key, reason: `upstream_error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  if (bills.length > DIGEST_REFRESH_MAX_BILLS) {
    failures.push({ bill: "*", reason: `truncated_to_${DIGEST_REFRESH_MAX_BILLS}_bills` });
  }

  return { requested: bills.length, refreshed, skipped, models: [...models], costUsd: Math.round(costUsd * 1e4) / 1e4, failures };
}

export function parseDigestRefreshRequest(url: URL, env: Env): BillRef[] {
  const congressParam = url.searchParams.get("congress");
  const congress = congressParam
    ? Number.parseInt(congressParam, 10)
    : congressNumber(env);
  if (Number.isNaN(congress) || congress <= 0) {
    throw new Error("Invalid congress query parameter");
  }

  const values = [
    ...url.searchParams.getAll("bill"),
    ...(url.searchParams.get("bills")?.split(",") ?? []),
  ].filter((value) => value.trim().length > 0);

  if (values.length === 0) {
    throw new Error("Provide at least one bill via ?bill=HR1234 or ?bills=HR1234,S456");
  }

  const bills = parseBillQueryList(values, congress);
  if (bills.length === 0) {
    throw new Error("No valid bill identifiers found (examples: HR1234, S.2, H.Res.512)");
  }

  return bills;
}
