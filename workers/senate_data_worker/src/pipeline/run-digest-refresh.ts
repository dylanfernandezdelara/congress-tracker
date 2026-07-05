import { DIGEST_REFRESH_MAX_BILLS } from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import { getDigest, upsertDigest } from "../d1/digests";
import { billLabel } from "./bill-label";
import { logDigestFailure } from "./digest-failure";
import { fetchBillSummaryBundle } from "../sources/congress-client";
import { parseBillQueryList } from "../sources/parse-bill-query";
import { resolveOpenRouterModel } from "../synthesis/model";
import { rewriteSummary } from "../synthesis/openrouter";
import type { BillRef } from "../types";
import type { DigestFailureReason } from "../../../../shared/digest-failure";

export interface DigestRefreshFailure {
  bill: string;
  reason: string;
}

export interface RunDigestRefreshResult {
  model: string;
  requested: number;
  refreshed: number;
  skipped: number;
  failures: DigestRefreshFailure[];
}

function formatBillKey(bill: BillRef): string {
  return `${bill.type}${bill.number}`;
}

export async function runDigestRefreshPipeline(
  env: Env,
  bills: BillRef[]
): Promise<RunDigestRefreshResult> {
  const model = await resolveOpenRouterModel(env);
  const limited = bills.slice(0, DIGEST_REFRESH_MAX_BILLS);
  const failures: DigestRefreshFailure[] = [];
  let refreshed = 0;
  let skipped = 0;

  for (const bill of limited) {
    const key = formatBillKey(bill);

    try {
      const bundle = await fetchBillSummaryBundle(env, bill);
      const label = billLabel(bill.type, bill.number, bill.congress);

      if (!bundle.rawSummaryText?.trim()) {
        const reason: DigestFailureReason = "no_crs_summary";
        logDigestFailure({ bill: label, reason, trigger: "admin" });
        await upsertDigest(env.DB, {
          congress: bill.congress,
          billType: bill.type,
          number: bill.number,
          title: bundle.title,
          policyArea: bundle.policyArea,
          rawSummaryText: bundle.rawSummaryText,
          digest: null,
          digestFailureReason: reason,
        });
        skipped += 1;
        failures.push({ bill: key, reason });
        continue;
      }

      const digest = await rewriteSummary(
        env,
        {
          title: bundle.title,
          billLabel: label,
          policyArea: bundle.policyArea,
          rawSummary: bundle.rawSummaryText,
        },
        model
      );

      if (!digest) {
        const reason: DigestFailureReason = "openrouter_rewrite_failed";
        logDigestFailure({ bill: label, reason, trigger: "admin" });
        const existing = await getDigest(env.DB, bill.congress, bill.type, bill.number);
        await upsertDigest(env.DB, {
          congress: bill.congress,
          billType: bill.type,
          number: bill.number,
          title: bundle.title,
          policyArea: bundle.policyArea,
          rawSummaryText: bundle.rawSummaryText,
          digest: null,
          digestFailureReason: reason,
          preserveDigestJson: existing?.digest_json ?? null,
        });
        skipped += 1;
        failures.push({ bill: key, reason });
        continue;
      }

      await upsertDigest(env.DB, {
        congress: bill.congress,
        billType: bill.type,
        number: bill.number,
        title: bundle.title,
        policyArea: bundle.policyArea,
        rawSummaryText: bundle.rawSummaryText,
        digest,
        digestFailureReason: null,
      });

      refreshed += 1;
    } catch (err) {
      skipped += 1;
      failures.push({
        bill: key,
        reason: "upstream_error",
      });
    }
  }

  if (bills.length > DIGEST_REFRESH_MAX_BILLS) {
    failures.push({
      bill: "*",
      reason: `truncated_to_${DIGEST_REFRESH_MAX_BILLS}_bills`,
    });
  }

  return {
    model,
    requested: bills.length,
    refreshed,
    skipped,
    failures,
  };
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
