/**
 * Explicit scheduled-ingestion stages. The orchestrator in
 * `scheduled-ingestion.ts` sequences these; each stage is individually
 * testable and receives shared inputs (e.g. one parsed vote menu per run).
 */
import {
  buildVoteLedgerUpdate,
  discoverVoteLedgerUpdates,
  type VoteLedgerDiscovery,
} from "../ingest";
import { runMemberIngestion, type MemberIngestResult } from "../member-ingest";
import { fetchVoteMenu, type FetchConfig } from "../fetch";
import { parseVoteMenuXml, type VoteSummary } from "../xml";
import type { Config } from "../config";
import type { FixtureHttp } from "../harness";
import type { MemberIndexJson, VoteLedger } from "../types";
import {
  attachImpactEvidenceToBill,
  buildBillEvidencePipeline,
  publishChamberContext,
  publishMemberActivity,
  collectUniqueBills,
  type BillEvidencePipelineResult,
} from "./materialize";
import { readDocumentJson, writeDocumentJson } from "../storage/documents";
import {
  buildActivitiesIndexKey,
  buildSessionOverviewKey,
  buildVoteLedgerKey,
} from "../storage";
import type { ActivityIndexJson } from "../types";

/** Fetch and parse the Senate vote menu once per ingestion run. */
export async function stageFetchVoteMenu(
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

/** Discover ledger updates using a pre-fetched menu when available. */
export async function stageDiscoverVoteUpdates(
  config: Config,
  existingLedger: VoteLedger | null,
  options: {
    db: D1Database;
    fetchConfig: FetchConfig;
    now: Date;
    /** `null` = upstream fetch failed; do not refetch. */
    menuVotes: VoteSummary[] | null;
  }
): Promise<VoteLedgerDiscovery> {
  return discoverVoteLedgerUpdates(config, existingLedger, {
    db: options.db,
    fetchConfig: options.fetchConfig,
    now: options.now,
    menuVotes: options.menuVotes ?? undefined,
  });
}

/** Member + activity ingestion (schedules, Congress, GovInfo, roll calls in window). */
export async function stageIngestMembers(
  config: Config,
  options: {
    congressApiKey: string;
    govInfoApiKey: string;
    now: Date;
    fixture: FixtureHttp;
    /** `null` = upstream fetch failed; do not refetch. */
    menuVotes: VoteSummary[] | null;
    fetchConfig: FetchConfig;
  }
): Promise<MemberIngestResult> {
  return runMemberIngestion(
    {
      congress: config.congress,
      session: config.session,
      congressApiKey: options.congressApiKey,
      govInfoApiKey: options.govInfoApiKey,
      lookbackDays: config.activityLookbackDays,
      now: options.now,
      fixture: options.fixture,
      menuVotes: options.menuVotes ?? undefined,
    },
    options.fetchConfig
  );
}

export async function stageResolveActivityIndex(
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

/** Harvest bill evidence for unique bills in member + activity feeds. */
export async function stageHarvestEvidence(
  db: D1Database,
  billsByKey: Map<string, import("../types").BillRef>,
  options: {
    runId: string;
    congressApiKey: string;
    session: number;
    maxBills: number;
    billConcurrency: number;
    endpointFanout: number;
    fixture: FixtureHttp;
  }
): Promise<BillEvidencePipelineResult> {
  return buildBillEvidencePipeline(db, billsByKey, options);
}

export function stageAttachEvidenceToActivities(
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

export async function stagePublishMemberCore(
  db: D1Database,
  membersIndex: MemberIndexJson,
  memberResult: MemberIngestResult,
  effectiveActivityIndex: ActivityIndexJson | null
): Promise<void> {
  await publishMemberActivity(
    db,
    membersIndex,
    memberResult.memberActivities,
    memberResult.windowEnd,
    effectiveActivityIndex
  );
  await publishChamberContext(db, memberResult.windowEnd, memberResult.context);
}

/** Build or update the vote ledger and session overview. */
export async function stageBuildVoteLedger(
  config: Config,
  membersIndex: MemberIndexJson,
  existingLedger: VoteLedger | null,
  fetchConfig: FetchConfig,
  options: {
    db: D1Database;
    discovery: VoteLedgerDiscovery;
    now: Date;
    /** `null` = upstream fetch failed; do not refetch. */
    menuVotes: VoteSummary[] | null;
  }
) {
  return buildVoteLedgerUpdate(config, membersIndex, existingLedger, fetchConfig, {
    db: options.db,
    discovery: options.discovery,
    now: options.now,
    menuVotes: options.menuVotes ?? undefined,
  });
}

export async function stagePublishVoteLedger(
  db: D1Database,
  ledger: VoteLedger,
  overview: import("../types").SessionOverview
): Promise<void> {
  await writeDocumentJson(db, buildVoteLedgerKey(), ledger, { skipIfUnchanged: true });
  await writeDocumentJson(db, buildSessionOverviewKey(), overview, { skipIfUnchanged: true });
}

export { collectUniqueBills };
