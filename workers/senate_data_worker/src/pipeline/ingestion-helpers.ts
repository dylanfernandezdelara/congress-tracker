/**
 * Scheduled-ingestion helpers with real behavior (fetch fallback, activity-index
 * reuse, evidence attachment). Thin pass-throughs live in the orchestrator.
 */
import { fetchVoteMenu, type FetchConfig } from "../fetch";
import { parseVoteMenuXml, type VoteSummary } from "../xml";
import type { MemberIngestResult } from "../member-ingest";
import {
  attachImpactEvidenceToBill,
  type BillEvidencePipelineResult,
} from "./materialize";
import { readDocumentJson } from "../storage/documents";
import { buildActivitiesIndexKey } from "../storage";
import type { ActivityIndexJson } from "../types";

/** Fetch and parse the Senate vote menu once per ingestion run. */
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

export async function resolveActivityIndex(
  db: D1Database,
  memberResult: MemberIngestResult
): Promise<ActivityIndexJson | null> {
  const previousActivityIndex = await readDocumentJson<ActivityIndexJson>(
    db,
    buildActivitiesIndexKey()
  );
  if ((memberResult.activityIndex?.activities?.length ?? 0) > 0) {
    return memberResult.activityIndex;
  }
  return previousActivityIndex;
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
