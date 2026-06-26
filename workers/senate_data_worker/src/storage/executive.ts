import type { ExecutiveAlertsResponse } from "../../../../shared/executive-api-types";
import { EXECUTIVE_SIGNAL_LOOKBACK_DAYS } from "../constants";
import type { Env } from "../config";
import {
  getExecutivePostBillsForPost,
  listRecentExecutiveAlerts,
  toExecutiveBillLink,
  toExecutiveSignal,
} from "../d1/executive";
import { getDigest, parseStoredDigest } from "../d1/digests";
import { lookbackStartIso } from "../sources/congress-client";

export async function buildExecutiveAlerts(
  env: Env,
  limit = 5
): Promise<ExecutiveAlertsResponse> {
  const since = lookbackStartIso(EXECUTIVE_SIGNAL_LOOKBACK_DAYS);
  const posts = await listRecentExecutiveAlerts(env.DB, since, limit);
  const alerts = [];

  for (const post of posts) {
    if (!post.summary) continue;
    const billRows = await getExecutivePostBillsForPost(env.DB, post.id);
    const linked_bills = [];
    for (const row of billRows) {
      const digest = await getDigest(env.DB, row.bill_congress, row.bill_type, row.bill_number);
      const parsed = parseStoredDigest(digest?.digest_json ?? null);
      linked_bills.push(
        toExecutiveBillLink(row, digest?.title ?? null, parsed?.headline ?? null)
      );
    }
    alerts.push({
      ...toExecutiveSignal(post),
      linked_bills,
    });
  }

  return { alerts };
}
