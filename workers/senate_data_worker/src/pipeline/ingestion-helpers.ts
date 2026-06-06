import { fetchVoteMenu, type FetchConfig } from "../fetch";
import { parseVoteMenuXml, type VoteSummary } from "../xml";
import type { MemberIngestResult } from "../member-ingest";
import {
  attachImpactEvidenceToBill,
  type BillEvidencePipelineResult,
} from "./materialize";
import type { ActivityIndexJson } from "../types";

export async function fetchAndParseVoteMenu(
  congress: number,
  session: number,
  fetchConfig: FetchConfig
): Promise<VoteSummary[] | null> {
  const menuResult = await fetchVoteMenu(congress, session, fetchConfig);
  if (!menuResult.success || !menuResult.data) {
    console.warn(`[ingest] Vote menu fetch failed: ${menuResult.error ?? "unknown"}`);
    return null;
  }
  return parseVoteMenuXml(menuResult.data);
}

export function resolveActivityIndex(
  memberResult: MemberIngestResult
): ActivityIndexJson | null {
  return memberResult.activityIndex ?? null;
}

export function attachEvidenceToActivities(
  memberActivities: MemberIngestResult["memberActivities"],
  activityIndex: ActivityIndexJson | null,
  impactByKey: BillEvidencePipelineResult["impactByKey"]
): void {
  for (const memberActivity of memberActivities) {
    for (const item of memberActivity.activities) {
      if (item.type !== "legislation_action" && item.type !== "roll_call_vote") continue;
      attachImpactEvidenceToBill(item.bill, impactByKey);
    }
  }
  for (const activity of activityIndex?.activities ?? []) {
    attachImpactEvidenceToBill(activity.bill, impactByKey);
  }
}
