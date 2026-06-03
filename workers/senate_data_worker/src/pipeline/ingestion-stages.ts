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
  enrichBillAnalyses,
  publishChamberContext,
  publishMemberActivity,
  collectUniqueBills,
  type BillEvidencePipelineResult,
  type QualityGateConfig,
} from "./materialize";
import { DEFAULT_OPENROUTER_MODELS, type AnalyzeBillsResult } from "../openrouter";
import { readDocumentJson, writeDocumentJson } from "../d1/documents";
import { hashRunId, logEvent } from "./logging";
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

export interface SynthesisStageResult {
  analysisResult: AnalyzeBillsResult | null;
  errors: import("../types").SourceError[];
}

export async function stageSynthesize(
  db: D1Database,
  options: {
    config: Config;
    runId: string;
    evidencePipeline: BillEvidencePipelineResult;
    memberResult: MemberIngestResult;
    effectiveActivityIndex: ActivityIndexJson | null;
    membersIndex: MemberIndexJson;
    qualityGateConfig: QualityGateConfig;
  }
): Promise<SynthesisStageResult> {
  const { config, runId, evidencePipeline, memberResult, effectiveActivityIndex, membersIndex } =
    options;
  const { synthesis } = config;
  const errors: import("../types").SourceError[] = [];
  const canaryValue = hashRunId(runId);
  const canaryEnabled = canaryValue < synthesis.canaryPercent;

  const qualityGateConfig = options.qualityGateConfig;

  if (!synthesis.enabled || !canaryEnabled) {
    if (config.fixtureMode) {
      errors.push({
        source: "congress",
        message: "Harness fixture mode active; synthesis skipped",
      });
    } else if (!synthesis.apiKey) {
      errors.push({
        source: "congress",
        message: "OPENROUTER_API_KEY missing; synthesis skipped",
      });
    } else {
      errors.push({
        source: "congress",
        message: `Synthesis skipped due to canary gating (${canaryValue} >= ${synthesis.canaryPercent})`,
      });
    }
    return { analysisResult: null, errors };
  }

  const models = synthesis.models;
  try {
    const analysisResult = await enrichBillAnalyses(
      db,
      evidencePipeline.billInputs,
      memberResult.memberActivities,
      effectiveActivityIndex,
      synthesis.apiKey as string,
      models.length > 0 ? models : [...DEFAULT_OPENROUTER_MODELS],
      synthesis.maxNewAnalyses,
      synthesis.shadowMode,
      qualityGateConfig,
      synthesis.appReferer,
      synthesis.appTitle
    );

    if (analysisResult && !synthesis.shadowMode) {
      try {
        await publishMemberActivity(
          db,
          membersIndex,
          memberResult.memberActivities,
          memberResult.windowEnd,
          effectiveActivityIndex
        );
      } catch (error) {
        errors.push({
          source: "congress",
          message: `Narrative publish failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }

    return { analysisResult, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({
      source: "congress",
      message: `OpenRouter synthesis failed but core publication remains available: ${message}`,
    });
    logEvent("openrouter_synthesis_failed", {
      run_id: runId,
      error: message,
    });
    return { analysisResult: null, errors };
  }
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
