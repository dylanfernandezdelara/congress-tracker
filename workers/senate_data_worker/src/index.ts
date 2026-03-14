/**
 * Senate Data Worker - Cloudflare Worker for Senate vote ingestion.
 *
 * Handles:
 * - Scheduled (cron) ingestion of Senate roll-call vote data
 * - HTTP API for serving precomputed JSON from R2
 */

import { runIngestion, runIngestionAllStates, buildVoteLedgerUpdate } from "./ingest";
import { runMemberIngestion } from "./member-ingest";
import { buildBillKey } from "./congress";
import {
  fetchVoteDetailsParallel,
  fetchVoteMenu,
  type FetchConfig,
} from "./fetch";
import { harvestBillEvidence, EVIDENCE_ENDPOINT_TIERS } from "./bill-evidence";
import { buildTrendSnapshot, extractBillImpactEvidence } from "./impact-extract";
import {
  analyzeBillsWithCache,
  DEFAULT_OPENROUTER_MODELS,
  type AnalyzeBillsResult,
} from "./openrouter";
import { applyHarnessEnv, getHarnessRuntime, isHarnessFixtureEnv } from "./harness";
import type {
  IngestConfig,
  SnapshotJson,
  MetaJson,
  MemberActivityJson,
  MemberIndexJson,
  ActivityIndexJson,
  VoteLedger,
  SessionOverview,
  BillRef,
  BillImpactEvidence,
  BillEvidenceRecord,
    CoverageSnapshot,
    EvidenceEndpoint,
    MemberActivityContext,
    SourceError,
} from "./types";
import { STATE_CODES } from "./states";
import {
  buildLatestKey,
  buildLatestChamberContextKey,
  buildLatestBriefingKey,
  buildMetaKey,
  buildSnapshotKey,
  buildMemberKeys,
  buildMemberLatestKey,
  buildMembersIndexKey,
  buildActivitiesIndexKey,
  buildVoteLedgerKey,
  buildVoteDetailKey,
  buildSessionOverviewKey,
  buildBillEvidenceKey,
  buildBillTrendSnapshotKey,
  buildCoverageSnapshotKey,
  buildChamberContextKey,
  publishToR2,
  readJsonFromR2,
  writeJsonToR2,
} from "./storage";
import { mapWithConcurrency } from "./concurrency";
import { buildPipelineMaterialization, buildVoteDetailResponse } from "./read-model";
import {
  readPipelineCheckpoint,
  writeHistoricalVoteBatchToD1,
  writePipelineCheckpoint,
  writePlatformMaterializationToD1,
  writeVoteEvidenceToD1,
} from "./d1";
import type { PipelineJob, PipelineMaterialization } from "./platform-types";
import { parseVoteDetailXml, parseVoteMenuXml } from "./xml";
import { extractVoteEvidence } from "./vote-evidence";

// ============================================================================
// Environment Types
// ============================================================================

interface Env {
  DATA_BUCKET: R2Bucket;
  CONGRESS: string;
  SESSION: string;
  TARGET_STATE: string;
  ALLOWED_ORIGIN?: string;
  CONGRESS_API_KEY: string;
  GOVINFO_API_KEY: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_APP_REFERER?: string;
  OPENROUTER_APP_TITLE?: string;
  OPENROUTER_SHADOW_MODE?: string;
  OPENROUTER_CANARY_PERCENT?: string;
  OPENROUTER_MAX_NEW_ANALYSES?: string;
  DATA_FRESHNESS_MAX_HOURS?: string;
  EVIDENCE_MAX_BILLS?: string;
  EVIDENCE_BILL_CONCURRENCY?: string;
  EVIDENCE_ENDPOINT_FANOUT?: string;
  ACTIVITY_LOOKBACK_DAYS?: string;
  SENATE_DB?: D1Database;
  PIPELINE_QUEUE?: Queue<PipelineJob>;
  QUALITY_MIN_CLAIMS_COVERAGE?: string;
  QUALITY_MIN_QUOTE_VALIDITY?: string;
  QUALITY_MAX_CONFIDENCE_MISMATCH?: string;
  QUALITY_HARD_GATES?: string;
  HARNESS_MODE?: string;
  HARNESS_FIXTURE_SET?: string;
  HARNESS_NOW?: string;
}

// ============================================================================
// Headers & Helpers
// ============================================================================

function buildCorsHeaders(env: Env): HeadersInit {
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim();
  const restrictedOrigin = allowedOrigin && allowedOrigin !== "*" ? allowedOrigin : null;
  const headers: HeadersInit = {
    "Access-Control-Allow-Origin": restrictedOrigin ?? "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (restrictedOrigin) {
    headers["Vary"] = "Origin";
  }
  return headers;
}

// Cache-Control values for the public HTTP API.
const cacheHealth = "s-maxage=60, max-age=0, must-revalidate";
const cacheLatest = "s-maxage=300, stale-while-revalidate=86400";
const cacheSnapshot = "s-maxage=86400, stale-while-revalidate=604800";

const buildJsonResponse = (body: unknown, corsHeaders: HeadersInit, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });

const buildNotFoundResponse = (path: string, corsHeaders: HeadersInit) =>
  buildJsonResponse(
    {
      error: "not_found",
      message: "Resource not found",
      path,
    },
    corsHeaders,
    { status: 404 }
  );

function parseBool(value: string | undefined, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return fallback;
}

function parseIntSafe(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

function parsePct(value: string | undefined, fallback: number): number {
  return Math.max(0, Math.min(parseIntSafe(value, fallback), 100));
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function computePct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

interface QualityGateConfig {
  minClaimsCoveragePct: number;
  minQuoteValidityPct: number;
  maxConfidenceMismatchPct: number;
  hardGates: boolean;
}

async function readPipelineStatus(db: D1Database) {
  // Miniflare's local D1 occasionally throws internal errors when this debug
  // endpoint fans out multiple reads at once. Keep these reads serialized so
  // the local status inspector stays stable.
  const voteStats =
    (await db
      .prepare(
        "SELECT COUNT(*) AS total_votes, MIN(vote_date) AS earliest_vote_date, MAX(vote_date) AS latest_vote_date FROM votes"
      )
      .first<Record<string, unknown>>()) ?? null;
  const excerptStats =
    (await db
      .prepare(
        "SELECT COUNT(*) AS excerpt_count, COUNT(DISTINCT vote_number) AS votes_with_excerpts FROM argument_excerpts"
      )
      .first<Record<string, unknown>>()) ?? null;
  const checkpointStats = await db
    .prepare(
      "SELECT checkpoint_key, cursor_json, updated_at FROM pipeline_checkpoints ORDER BY checkpoint_key"
    )
    .all<Record<string, unknown>>();

  return {
    votes: voteStats,
    excerpts: excerptStats,
    checkpoints: checkpointStats.results ?? [],
  };
}

function makeRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hashRunId(runId: string): number {
  let hash = 0;
  for (let i = 0; i < runId.length; i++) {
    hash = (hash << 5) - hash + runId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
}

function logEvent(event: string, payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...payload }));
}

async function runTimed<T>(
  runId: string,
  phase: string,
  fn: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    logEvent("phase_complete", {
      run_id: runId,
      phase,
      duration_ms: Date.now() - started,
      success: true,
    });
    return result;
  } catch (error) {
    logEvent("phase_complete", {
      run_id: runId,
      phase,
      duration_ms: Date.now() - started,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function summarizeCoverage(
  runId: string,
  billCount: number,
  claimCoveragePct: number,
  benefitMapCoveragePct: number,
  likelyReasonCoveragePct: number,
  quoteValidityPct: number,
  confidenceMismatchPct: number,
  endpointSuccessRates: Partial<Record<EvidenceEndpoint, number>>,
  endpointFallbackRates: Partial<Record<EvidenceEndpoint, number>>,
  structuredAmountCount: number,
  recipientCount: number,
  stateSignalCount: number,
  partial: boolean,
  errors: SourceError[]
): CoverageSnapshot {
  return {
    generated_at: new Date().toISOString(),
    run_id: runId,
    bills_processed: billCount,
    bills_with_structured_amount: structuredAmountCount,
    bills_with_recipient: recipientCount,
    bills_with_state_signal: stateSignalCount,
    pct_with_structured_amount: computePct(structuredAmountCount, billCount),
    pct_with_recipient: computePct(recipientCount, billCount),
    pct_with_state_signal: computePct(stateSignalCount, billCount),
    pct_claims_with_evidence_refs: claimCoveragePct,
    pct_benefit_map_with_evidence_refs: benefitMapCoveragePct,
    pct_likely_reasons_with_evidence_refs: likelyReasonCoveragePct,
    pct_quote_validity: quoteValidityPct,
    pct_confidence_calibration_mismatch: confidenceMismatchPct,
    endpoint_success_rates: endpointSuccessRates,
    endpoint_fallback_rates: endpointFallbackRates,
    partial,
    errors,
  };
}

const PIPELINE_FETCH_CONFIG: FetchConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeoutMs: 15_000,
  concurrency: 2,
  maxDelayMs: 30_000,
};

const HISTORICAL_BACKFILL_BATCH_SIZE = 20;

function diffVoteNumbers(current: VoteLedger, previous: VoteLedger | null): number[] {
  const previousNumbers = new Set((previous?.entries ?? []).map((entry) => entry.vote_number));
  return current.entries
    .map((entry) => entry.vote_number)
    .filter((voteNumber) => !previousNumbers.has(voteNumber));
}

async function publishChamberContext(
  bucket: R2Bucket,
  windowEnd: string,
  context: MemberActivityContext
): Promise<void> {
  await writeJsonToR2(bucket, buildChamberContextKey(windowEnd), context);
  await writeJsonToR2(bucket, buildLatestChamberContextKey(), context);
}

async function readLatestChamberContext(bucket: R2Bucket): Promise<MemberActivityContext | null> {
  return readJsonFromR2<MemberActivityContext>(bucket, buildLatestChamberContextKey());
}

// ============================================================================
// R2 Storage
// ============================================================================
// ============================================================================
// HTTP Handler
// ============================================================================

async function handleFetch(request: Request, env: Env): Promise<Response> {
  applyHarnessEnv(env);
  const { pathname } = new URL(request.url);
  const corsHeaders = buildCorsHeaders(env);
  const jsonResponse = (body: unknown, init?: ResponseInit) =>
    buildJsonResponse(body, corsHeaders, init);
  const notFoundResponse = (path: string) => buildNotFoundResponse(path, corsHeaders);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only allow GET requests
  if (request.method !== "GET") {
    return jsonResponse(
      {
        error: "method_not_allowed",
        message: "Only GET requests are allowed",
      },
      { status: 405 }
    );
  }

  // Health check (no R2 access)
  if (pathname === "/health") {
    return jsonResponse(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
        target_state: env.TARGET_STATE,
        congress: env.CONGRESS,
        session: env.SESSION,
      },
      {
        status: 200,
        headers: { "Cache-Control": cacheHealth },
      }
    );
  }

  if (pathname === "/health/data") {
    const maxFreshHours = Math.max(1, parseIntSafe(env.DATA_FRESHNESS_MAX_HOURS, 36));
    const activityIndex = await readJsonFromR2<ActivityIndexJson>(
      env.DATA_BUCKET,
      buildActivitiesIndexKey()
    );
    if (!activityIndex?.generated_at) {
      return jsonResponse(
        {
          status: "stale",
          message: "No activities index found in storage.",
          max_fresh_hours: maxFreshHours,
        },
        {
          status: 503,
          headers: { "Cache-Control": cacheHealth },
        }
      );
    }
    const generatedAt = new Date(activityIndex.generated_at).getTime();
    const now = Date.now();
    const ageHours = Number(((now - generatedAt) / 3_600_000).toFixed(2));
    const fresh = Number.isFinite(generatedAt) && ageHours <= maxFreshHours;
    return jsonResponse(
      {
        status: fresh ? "ok" : "stale",
        generated_at: activityIndex.generated_at,
        age_hours: ageHours,
        max_fresh_hours: maxFreshHours,
      },
      {
        status: fresh ? 200 : 503,
        headers: { "Cache-Control": cacheHealth },
      }
    );
  }

  if (pathname === "/__pipeline/status") {
    if (!env.SENATE_DB) {
      return jsonResponse(
        { status: "ok", queue_enabled: Boolean(env.PIPELINE_QUEUE), d1_enabled: false },
        { status: 200, headers: { "Cache-Control": cacheHealth } }
      );
    }

    const pipelineStatus = await readPipelineStatus(env.SENATE_DB);

    return jsonResponse(
      {
        status: "ok",
        queue_enabled: Boolean(env.PIPELINE_QUEUE),
        d1_enabled: true,
        ...pipelineStatus,
      },
      { status: 200, headers: { "Cache-Control": cacheHealth } }
    );
  }

  if (pathname === "/__pipeline/run/materialize") {
    const [ledger, overview, activityIndex] = await Promise.all([
      readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey()),
      readJsonFromR2<SessionOverview>(env.DATA_BUCKET, buildSessionOverviewKey()),
      readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey()),
    ]);
    if (!ledger || !overview) {
      return jsonResponse(
        { error: "missing_prerequisites", message: "Ledger or overview data is missing from storage." },
        { status: 503 }
      );
    }
    await materializeReadModels(env, ledger, overview, activityIndex);
    return jsonResponse({ status: "ok", action: "materialize", vote_count: ledger.entries.length }, { status: 200 });
  }

  if (pathname === "/__pipeline/run/ingestion") {
    await runScheduledIngestion(env);
    return jsonResponse({ status: "ok", action: "scheduled_ingestion" }, { status: 200 });
  }

  if (pathname === "/__pipeline/run/evidence") {
    const voteNumber = Number(new URL(request.url).searchParams.get("vote"));
    if (!Number.isInteger(voteNumber) || voteNumber <= 0) {
      return jsonResponse(
        { error: "invalid_vote", message: "Provide a positive integer vote query parameter." },
        { status: 400 }
      );
    }
    await processPipelineJob(
      {
        type: "extract_vote_evidence",
        created_at: new Date().toISOString(),
        congress: Number(env.CONGRESS),
        session: Number(env.SESSION),
        vote_number: voteNumber,
      },
      env
    );
    return jsonResponse({ status: "ok", action: "extract_vote_evidence", vote_number: voteNumber }, { status: 200 });
  }

  if (pathname === "/__pipeline/run/historical-backfill") {
    const params = new URL(request.url).searchParams;
    const congress = Number(params.get("congress") ?? env.CONGRESS);
    const sessionParam = params.get("session");
    const session = sessionParam ? Number(sessionParam) : undefined;
    if (!Number.isInteger(congress) || congress <= 0 || (session !== undefined && (!Number.isInteger(session) || session < 1 || session > 2))) {
      return jsonResponse(
        { error: "invalid_backfill_target", message: "Provide a valid congress and optional session=1|2." },
        { status: 400 }
      );
    }
    await processPipelineJob(
      {
        type: "historical_backfill",
        created_at: new Date().toISOString(),
        congress,
        session,
      },
      env
    );
    return jsonResponse(
      { status: "ok", action: "historical_backfill", congress, session: session ?? null, inline: !env.PIPELINE_QUEUE },
      { status: 200 }
    );
  }

  // Match /state/{STATE}/latest.json
  const latestMatch = pathname.match(/^\/state\/([A-Z]{2})\/latest\.json$/);
  if (latestMatch) {
    const state = latestMatch[1];
    const key = buildLatestKey(state);
    const data = await readJsonFromR2<SnapshotJson>(env.DATA_BUCKET, key);

    if (!data) {
      return notFoundResponse(pathname);
    }

    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /members/index.json
  if (pathname === "/members/index.json") {
    const key = buildMembersIndexKey();
    const data = await readJsonFromR2<MemberIndexJson>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /activities/index.json
  if (pathname === "/activities/index.json") {
    const key = buildActivitiesIndexKey();
    const data = await readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /votes/ledger.json
  if (pathname === "/votes/ledger.json") {
    const key = buildVoteLedgerKey();
    const data = await readJsonFromR2<VoteLedger>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /stats/overview.json
  if (pathname === "/stats/overview.json") {
    const key = buildSessionOverviewKey();
    const data = await readJsonFromR2<SessionOverview>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /member/{BIOGUIDE}/latest.json
  const memberLatestMatch = pathname.match(/^\/member\/([A-Z]\d{6})\/latest\.json$/);
  if (memberLatestMatch) {
    const bioguide = memberLatestMatch[1];
    const key = buildMemberLatestKey(bioguide);
    const data = await readJsonFromR2<MemberActivityJson>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /member/{BIOGUIDE}/{YYYY-MM-DD}.json
  const memberSnapshotMatch = pathname.match(
    /^\/member\/([A-Z]\d{6})\/(\d{4}-\d{2}-\d{2})\.json$/
  );
  if (memberSnapshotMatch) {
    const bioguide = memberSnapshotMatch[1];
    const date = memberSnapshotMatch[2];
    const key = buildMemberKeys(bioguide, date).snapshot;
    const data = await readJsonFromR2<MemberActivityJson>(env.DATA_BUCKET, key);
    if (!data) {
      return notFoundResponse(pathname);
    }
    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheSnapshot },
    });
  }

  // Match /state/{STATE}/_meta.json
  const metaMatch = pathname.match(/^\/state\/([A-Z]{2})\/_meta\.json$/);
  if (metaMatch) {
    const state = metaMatch[1];
    const key = buildMetaKey(state);
    const data = await readJsonFromR2<MetaJson>(env.DATA_BUCKET, key);

    if (!data) {
      return notFoundResponse(pathname);
    }

    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheLatest },
    });
  }

  // Match /state/{STATE}/{YYYY-MM-DD}.json (dated snapshot)
  const snapshotMatch = pathname.match(
    /^\/state\/([A-Z]{2})\/(\d{4}-\d{2}-\d{2})\.json$/
  );
  if (snapshotMatch) {
    const state = snapshotMatch[1];
    const date = snapshotMatch[2];
    const key = buildSnapshotKey(state, date);
    const data = await readJsonFromR2<SnapshotJson>(env.DATA_BUCKET, key);

    if (!data) {
      return notFoundResponse(pathname);
    }

    return jsonResponse(data, {
      status: 200,
      headers: { "Cache-Control": cacheSnapshot },
    });
  }

  // No route matched
  return notFoundResponse(pathname);
}

// ============================================================================
// Scheduled (Cron) Handler
// ============================================================================

/**
 * Validates environment configuration and throws if invalid.
 * Fails loudly so cron misconfigurations are caught immediately.
 */
function validateEnv(env: Env): IngestConfig {
  const errors: string[] = [];
  const fixtureMode = isHarnessFixtureEnv(env);

  // Validate CONGRESS
  if (!env.CONGRESS) {
    errors.push("CONGRESS environment variable is missing");
  }
  const congress = parseInt(env.CONGRESS, 10);
  if (isNaN(congress) || congress <= 0) {
    errors.push(`CONGRESS must be a positive integer, got: "${env.CONGRESS}"`);
  }

  // Validate SESSION
  if (!env.SESSION) {
    errors.push("SESSION environment variable is missing");
  }
  const session = parseInt(env.SESSION, 10);
  if (isNaN(session) || session <= 0 || session > 2) {
    errors.push(`SESSION must be 1 or 2, got: "${env.SESSION}"`);
  }

  // Validate TARGET_STATE
  if (!env.TARGET_STATE) {
    errors.push("TARGET_STATE environment variable is missing");
  }
  const targetState = env.TARGET_STATE?.trim().toUpperCase() ?? "";
  if (!(targetState === "ALL" || /^[A-Z]{2}$/.test(targetState))) {
    errors.push(
      `TARGET_STATE must be a 2-letter state code or "ALL", got: "${env.TARGET_STATE}"`
    );
  }

  if (!env.CONGRESS_API_KEY && !fixtureMode) {
    errors.push("CONGRESS_API_KEY is missing");
  }
  if (!env.GOVINFO_API_KEY && !fixtureMode) {
    errors.push("GOVINFO_API_KEY is missing");
  }

  // Fail loudly if any validation errors
  if (errors.length > 0) {
    const errorMsg = `[scheduled] CONFIGURATION ERROR:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return {
    congress,
    session,
    targetState,
    congressApiKey: env.CONGRESS_API_KEY || "HARNESS_FIXTURE_KEY",
  };
}

async function publishMemberActivity(
  bucket: R2Bucket,
  membersIndex: MemberIndexJson,
  memberActivities: MemberActivityJson[],
  windowEnd: string,
  activityIndex: ActivityIndexJson | null
): Promise<void> {
  console.log("[r2] Publishing member activity...");

  await writeJsonToR2(bucket, buildMembersIndexKey(), membersIndex);
  if (activityIndex) {
    await writeJsonToR2(bucket, buildActivitiesIndexKey(), activityIndex);
  }

  await mapWithConcurrency(memberActivities, 3, async (activity) => {
    const keys = buildMemberKeys(activity.member.bioguide_id, windowEnd);
    await writeJsonToR2(bucket, keys.snapshot, activity);
    await writeJsonToR2(bucket, keys.latest, activity);
  });

  console.log("[r2] Member activity publish complete");
}

function canBuildBillKey(bill: BillRef | undefined): bill is BillRef {
  return Boolean(
    bill &&
    typeof bill.congress === "number" &&
    typeof bill.type === "string" &&
    bill.type.trim() &&
    typeof bill.number === "string" &&
    bill.number.trim()
  );
}

function collectUniqueBills(
  memberActivities: MemberActivityJson[],
  activityIndex: ActivityIndexJson | null
): Map<string, BillRef> {
  const byKey = new Map<string, BillRef>();
  for (const memberActivity of memberActivities) {
    for (const item of memberActivity.activities) {
      if ((item.type === "legislation_action" || item.type === "roll_call_vote") && item.bill) {
        const key = buildBillKey(item.bill);
        if (!byKey.has(key)) byKey.set(key, item.bill);
      }
    }
  }
  for (const activity of activityIndex?.activities ?? []) {
    if (!activity.bill) continue;
    const key = buildBillKey(activity.bill);
    if (!byKey.has(key)) byKey.set(key, activity.bill);
  }
  return byKey;
}

function attachImpactEvidenceToBill(
  bill: BillRef | undefined,
  impactByKey: ReadonlyMap<string, BillImpactEvidence>
): void {
  if (!canBuildBillKey(bill)) return;
  const key = buildBillKey(bill);
  const impact = impactByKey.get(key);
  if (impact) bill.impact_evidence = impact;
}

function attachAnalysisToBill(
  bill: BillRef | undefined,
  analysisByKey: ReadonlyMap<string, NonNullable<BillRef["analysis"]>>
): void {
  if (!canBuildBillKey(bill)) return;
  const key = buildBillKey(bill);
  const analysis = analysisByKey.get(key);
  if (analysis) bill.analysis = analysis;
}

interface BillEvidencePipelineResult {
  processedBillCount: number;
  impactByKey: Map<string, BillImpactEvidence>;
  billInputs: Array<{ bill: BillRef; impactEvidence?: BillImpactEvidence }>;
  endpointSuccessRates: Partial<Record<EvidenceEndpoint, number>>;
  endpointFallbackRates: Partial<Record<EvidenceEndpoint, number>>;
  structuredAmountCount: number;
  recipientCount: number;
  stateSignalCount: number;
  errors: SourceError[];
}

interface BillEvidencePipelineOptions {
  runId: string;
  congressApiKey: string;
  session: number;
  maxBills: number;
  billConcurrency: number;
  endpointFanout: number;
}

function evaluateQualityGates(
  result: AnalyzeBillsResult,
  config: QualityGateConfig
): string[] {
  const failures: string[] = [];
  if (result.claimsWithEvidenceRefPct < config.minClaimsCoveragePct) {
    failures.push(
      `claims coverage ${result.claimsWithEvidenceRefPct}% < ${config.minClaimsCoveragePct}%`
    );
  }
  if (result.quoteValidityPct < config.minQuoteValidityPct) {
    failures.push(
      `quote validity ${result.quoteValidityPct}% < ${config.minQuoteValidityPct}%`
    );
  }
  if (result.confidenceCalibrationMismatchPct > config.maxConfidenceMismatchPct) {
    failures.push(
      `confidence mismatch ${result.confidenceCalibrationMismatchPct}% > ${config.maxConfidenceMismatchPct}%`
    );
  }
  return failures;
}

async function buildBillEvidencePipeline(
  bucket: R2Bucket,
  billsByKey: Map<string, BillRef>,
  options: BillEvidencePipelineOptions
): Promise<BillEvidencePipelineResult> {
  const entries = Array.from(billsByKey.entries()).slice(0, options.maxBills);
  const endpointStats: Record<EvidenceEndpoint, { ok: number; total: number }> = {
    detail: { ok: 0, total: 0 },
    summaries: { ok: 0, total: 0 },
    subjects: { ok: 0, total: 0 },
    committees: { ok: 0, total: 0 },
    text: { ok: 0, total: 0 },
    actions: { ok: 0, total: 0 },
    amendments: { ok: 0, total: 0 },
    cbo_cost_estimates: { ok: 0, total: 0 },
    committee_reports: { ok: 0, total: 0 },
    related_bills: { ok: 0, total: 0 },
    cosponsors: { ok: 0, total: 0 },
  };
  const endpointFallbackStats: Record<EvidenceEndpoint, { fallback: number; total: number }> = {
    detail: { fallback: 0, total: 0 },
    summaries: { fallback: 0, total: 0 },
    subjects: { fallback: 0, total: 0 },
    committees: { fallback: 0, total: 0 },
    text: { fallback: 0, total: 0 },
    actions: { fallback: 0, total: 0 },
    amendments: { fallback: 0, total: 0 },
    cbo_cost_estimates: { fallback: 0, total: 0 },
    committee_reports: { fallback: 0, total: 0 },
    related_bills: { fallback: 0, total: 0 },
    cosponsors: { fallback: 0, total: 0 },
  };
  const errors: SourceError[] = [];
  const impactByKey = new Map<string, BillImpactEvidence>();
  const billInputs: Array<{ bill: BillRef; impactEvidence?: BillImpactEvidence }> = [];

  const fetchConfig = {
    maxRetries: 3,
    baseDelayMs: 800,
    timeoutMs: 15_000,
    concurrency: options.endpointFanout,
  };

  await mapWithConcurrency(entries, options.billConcurrency, async ([key, bill]) => {
    const harvested = await harvestBillEvidence(bill, options.congressApiKey, {
      endpointFanout: options.endpointFanout,
      fetchConfig,
    });
    if (harvested.error) {
      errors.push({
        source: "congress",
        message: `Evidence harvest issue for ${key}: ${harvested.error}`,
      });
    }
    for (const endpoint of Object.keys(EVIDENCE_ENDPOINT_TIERS) as EvidenceEndpoint[]) {
      const status = harvested.evidence.endpoints[endpoint];
      if (!status) continue;
      endpointStats[endpoint].total += 1;
      if (status.ok) endpointStats[endpoint].ok += 1;
      endpointFallbackStats[endpoint].total += 1;
      if (status.fallback_used) endpointFallbackStats[endpoint].fallback += 1;
    }

    const impact = extractBillImpactEvidence(bill, harvested.evidence, {
      session: options.session,
    });
    const snapshotDate = impact.generated_at.slice(0, 10);
    const trendSnapshot = buildTrendSnapshot(bill, impact, snapshotDate);
    const record: BillEvidenceRecord = {
      schema_version: 1,
      generated_at: impact.generated_at,
      raw: harvested.evidence,
      impact,
    };
    await writeJsonToR2(bucket, buildBillEvidenceKey(key), record);
    await writeJsonToR2(
      bucket,
      buildBillTrendSnapshotKey(bill.congress, key, snapshotDate),
      trendSnapshot
    );
    impactByKey.set(key, impact);
    billInputs.push({ bill, impactEvidence: impact });
  });

  const endpointSuccessRates: Partial<Record<EvidenceEndpoint, number>> = {};
  const endpointFallbackRates: Partial<Record<EvidenceEndpoint, number>> = {};
  for (const [endpoint, stats] of Object.entries(endpointStats) as Array<
    [EvidenceEndpoint, { ok: number; total: number }]
  >) {
    endpointSuccessRates[endpoint] = computePct(stats.ok, stats.total);
    const fallbackStats = endpointFallbackStats[endpoint];
    endpointFallbackRates[endpoint] = computePct(fallbackStats.fallback, fallbackStats.total);
  }

  let structuredAmountCount = 0;
  let recipientCount = 0;
  let stateSignalCount = 0;
  for (const impact of impactByKey.values()) {
    if (impact.how_much.length > 0) structuredAmountCount++;
    if (impact.who.length > 0) recipientCount++;
    if (
      impact.where.states_mentioned.length > 0 ||
      impact.where.geography_scope === "state-formula"
    ) {
      stateSignalCount++;
    }
  }

  logEvent("bill_evidence_pipeline_complete", {
    run_id: options.runId,
    processed_bills: entries.length,
    structured_amount_count: structuredAmountCount,
    recipient_count: recipientCount,
    state_signal_count: stateSignalCount,
  });

  return {
    processedBillCount: entries.length,
    impactByKey,
    billInputs,
    endpointSuccessRates,
    endpointFallbackRates,
    structuredAmountCount,
    recipientCount,
    stateSignalCount,
    errors,
  };
}

async function enrichBillAnalyses(
  bucket: R2Bucket,
  billInputs: Array<{ bill: BillRef; impactEvidence?: BillImpactEvidence }>,
  memberActivities: MemberActivityJson[],
  activityIndex: ActivityIndexJson | null,
  apiKey: string,
  models: string[],
  maxNewAnalyses: number,
  shadowMode: boolean,
  qualityGateConfig: QualityGateConfig,
  appReferer?: string,
  appTitle?: string
): Promise<AnalyzeBillsResult | null> {
  if (billInputs.length === 0) {
    console.log("[openrouter] No bill refs found for analysis enrichment");
    return null;
  }

  const result = await analyzeBillsWithCache(bucket, billInputs, {
    apiKey,
    models,
    maxNewAnalyses,
    appReferer,
    appTitle,
    timeoutMs: 30_000,
    maxRetries: 2,
    analysisConcurrency: 2,
  });
  const modelSuccessCount = Math.max(0, result.analyzedCount - result.fallbackCount);

  console.log(
    `[openrouter] Analysis enrichment complete: cache hits=${result.cacheHitCount}, saved=${result.analyzedCount}, model-success=${modelSuccessCount}, fallback=${result.fallbackCount}, deferred=${result.deferredCount}, input-skipped=${result.inputSkipCount}, claim-coverage=${result.claimsWithEvidenceRefPct}%, benefit-map-coverage=${result.benefitMapWithEvidenceRefPct}%, likely-reason-coverage=${result.likelyReasonsWithEvidenceRefPct}%, quote-validity=${result.quoteValidityPct}%, confidence-mismatch=${result.confidenceCalibrationMismatchPct}%`
  );
  if (result.deferredCount > 0) {
    console.log(
      `[openrouter] ${result.deferredCount} analyses deferred by maxNewAnalyses limit; refresh will continue across scheduled runs.`
    );
  }
  if (result.fallbackCount > 0) {
    console.log(
      `[openrouter] ${result.fallbackCount} analyses fell back to deterministic summaries after model output or parse failures.`
    );
  }
  if (result.inputSkipCount > 0) {
    console.log(
      `[openrouter] ${result.inputSkipCount} analyses were skipped because the bill lacked enough title or summary text.`
    );
  }
  const gateFailures = evaluateQualityGates(result, qualityGateConfig);
  if (gateFailures.length > 0) {
    logEvent("analysis_quality_gate_failed", {
      failures: gateFailures,
      hard_gates: qualityGateConfig.hardGates,
      claims_coverage_pct: result.claimsWithEvidenceRefPct,
      quote_validity_pct: result.quoteValidityPct,
      confidence_mismatch_pct: result.confidenceCalibrationMismatchPct,
    });
    if (qualityGateConfig.hardGates) {
      throw new Error(`Analysis quality gates failed: ${gateFailures.join("; ")}`);
    }
  }

  if (shadowMode) {
    console.log("[openrouter] Shadow mode active; analysis was generated but not attached to published payloads.");
    return result;
  }

  for (const memberActivity of memberActivities) {
    for (const item of memberActivity.activities) {
      if (item.type !== "legislation_action" && item.type !== "roll_call_vote") continue;
      attachAnalysisToBill(item.bill, result.analysisByKey);
    }
  }

  for (const activity of activityIndex?.activities ?? []) {
    attachAnalysisToBill(activity.bill, result.analysisByKey);
  }
  return result;
}

async function publishAllStatesToR2(
  bucket: R2Bucket,
  perState: Record<string, { snapshot: SnapshotJson; meta: MetaJson }>
): Promise<void> {
  const entries = Object.entries(perState);
  await mapWithConcurrency(entries, 3, async ([state, payload]) => {
    console.log(`[r2] Publishing ${state} vote data...`);
    await publishToR2(bucket, payload.snapshot, payload.meta);
  });
}

async function publishReadModelsToR2(
  bucket: R2Bucket,
  materialization: PipelineMaterialization
): Promise<void> {
  await writeJsonToR2(bucket, buildLatestBriefingKey(), materialization.briefing);
  await mapWithConcurrency(materialization.voteDetails, 4, async (detail) => {
    await writeJsonToR2(
      bucket,
      buildVoteDetailKey(detail.vote.congress, detail.vote.session, detail.vote.vote_number),
      detail
    );
  });
}

async function materializeReadModels(
  env: Env,
  ledger: VoteLedger,
  overview: SessionOverview,
  activityIndex: ActivityIndexJson | null
): Promise<void> {
  const materialization = buildPipelineMaterialization(ledger, overview, activityIndex);
  await publishReadModelsToR2(env.DATA_BUCKET, materialization);
  if (env.SENATE_DB) {
    await writePlatformMaterializationToD1(
      env.SENATE_DB,
      ledger,
      overview,
      activityIndex,
      materialization
    );
  }
}

async function enqueuePipelineJob(env: Env, job: PipelineJob): Promise<boolean> {
  if (!env.PIPELINE_QUEUE) return false;
  try {
    await env.PIPELINE_QUEUE.send(job);
    return true;
  } catch (error) {
    logEvent("pipeline_queue_enqueue_failed", {
      type: job.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function processExtractVoteEvidenceJob(
  job: Extract<PipelineJob, { type: "extract_vote_evidence" }>,
  env: Env
): Promise<void> {
  if (!env.SENATE_DB) {
    logEvent("extract_vote_evidence_skipped", {
      reason: "missing_d1",
      congress: job.congress,
      session: job.session,
      vote_number: job.vote_number,
    });
    return;
  }

  const [ledger, overview, activityIndex, context] = await Promise.all([
    readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey()),
    readJsonFromR2<SessionOverview>(env.DATA_BUCKET, buildSessionOverviewKey()),
    readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey()),
    readLatestChamberContext(env.DATA_BUCKET),
  ]);
  if (!ledger || !overview) {
    throw new Error("Vote evidence job missing ledger or overview in storage");
  }

  const detail = buildVoteDetailResponse(ledger, overview, activityIndex, job.vote_number, "derived");
  if (!detail) {
    logEvent("extract_vote_evidence_skipped", {
      reason: "vote_detail_missing",
      congress: job.congress,
      session: job.session,
      vote_number: job.vote_number,
    });
    return;
  }

  const evidence = await extractVoteEvidence(
    env,
    detail,
    overview,
    context,
    PIPELINE_FETCH_CONFIG
  );
  await writeVoteEvidenceToD1(
    env.SENATE_DB,
    detail.vote.congress,
    detail.vote.session,
    detail.vote.vote_number,
    evidence
  );

  logEvent("extract_vote_evidence_complete", {
    congress: job.congress,
    session: job.session,
    vote_number: job.vote_number,
    excerpts: evidence.excerpts.length,
    documents: evidence.documents.length,
  });
}

async function processHistoricalBackfillJob(
  job: Extract<PipelineJob, { type: "historical_backfill" }>,
  env: Env
): Promise<void> {
  if (!env.SENATE_DB) {
    logEvent("historical_backfill_skipped", {
      reason: "missing_d1",
      congress: job.congress,
      session: job.session ?? null,
    });
    return;
  }

  const sessions = job.session ? [job.session] : [1, 2];
  const checkpointKey = `historical_backfill:${job.congress}:${job.session ?? "all"}`;
  const inlineMode = !env.PIPELINE_QUEUE;
  let resumed = false;

  while (true) {
    const checkpoint = await readPipelineCheckpoint<{ session_index: number; offset: number }>(
      env.SENATE_DB,
      checkpointKey
    );
    let sessionIndex = checkpoint?.cursor.session_index ?? 0;
    let offset = checkpoint?.cursor.offset ?? 0;
    resumed = resumed || Boolean(checkpoint);

    if (sessionIndex >= sessions.length) {
      logEvent("historical_backfill_complete", {
        congress: job.congress,
        session: job.session ?? null,
        resumed,
      });
      return;
    }

    const targetSession = sessions[sessionIndex];
    const menuResult = await fetchVoteMenu(job.congress, targetSession, PIPELINE_FETCH_CONFIG);
    if (!menuResult.success || !menuResult.data) {
      throw new Error(menuResult.error ?? "Failed to fetch vote menu for historical backfill");
    }

    const menuVotes = parseVoteMenuXml(menuResult.data).sort((a, b) => a.vote_number - b.vote_number);
    const batch = menuVotes.slice(offset, offset + HISTORICAL_BACKFILL_BATCH_SIZE);
    if (batch.length === 0) {
      sessionIndex += 1;
      offset = 0;
      await writePipelineCheckpoint(env.SENATE_DB, checkpointKey, {
        session_index: sessionIndex,
        offset,
      });
      if (!inlineMode && sessionIndex < sessions.length) {
        await enqueuePipelineJob(env, {
          type: "historical_backfill",
          created_at: new Date().toISOString(),
          congress: job.congress,
          session: job.session,
        });
        return;
      }
      continue;
    }

    const detailResults = await fetchVoteDetailsParallel(
      batch.map((entry) => entry.vote_number),
      job.congress,
      targetSession,
      { ...PIPELINE_FETCH_CONFIG, concurrency: 2 }
    );
    const parsed = batch
      .map((entry) => detailResults.results.get(entry.vote_number)?.data)
      .filter((value): value is string => Boolean(value))
      .map((xml) => parseVoteDetailXml(xml, job.congress, targetSession))
      .filter((value): value is NonNullable<ReturnType<typeof parseVoteDetailXml>> => Boolean(value));

    await writeHistoricalVoteBatchToD1(env.SENATE_DB, parsed);

    const nextOffset = offset + batch.length;
    await writePipelineCheckpoint(env.SENATE_DB, checkpointKey, {
      session_index: sessionIndex,
      offset: nextOffset,
    });

    logEvent("historical_backfill_batch_complete", {
      congress: job.congress,
      session: targetSession,
      offset,
      processed: parsed.length,
      total_menu_votes: menuVotes.length,
      inline: inlineMode,
    });

    if (nextOffset < menuVotes.length || sessionIndex < sessions.length - 1) {
      if (!inlineMode) {
        await enqueuePipelineJob(env, {
          type: "historical_backfill",
          created_at: new Date().toISOString(),
          congress: job.congress,
          session: job.session,
        });
        return;
      }
      continue;
    }

    await writePipelineCheckpoint(env.SENATE_DB, checkpointKey, {
      session_index: sessions.length,
      offset: 0,
    });
    logEvent("historical_backfill_complete", {
      congress: job.congress,
      session: job.session ?? null,
      resumed,
    });
    return;
  }
}

/**
 * Core ingestion logic, separated for use with ctx.waitUntil.
 */
async function runScheduledIngestion(env: Env): Promise<void> {
  applyHarnessEnv(env);
  const runId = makeRunId();
  const startTime = Date.now();
  logEvent("scheduled_ingestion_start", {
    run_id: runId,
    timestamp: new Date().toISOString(),
  });

  const config = validateEnv(env);
  const congressApiKey = env.CONGRESS_API_KEY || config.congressApiKey;
  const govInfoApiKey = env.GOVINFO_API_KEY || "HARNESS_FIXTURE_KEY";
  const evidenceMaxBills = Math.max(5, parseIntSafe(env.EVIDENCE_MAX_BILLS, 30));
  const evidenceBillConcurrency = Math.max(
    1,
    Math.min(parseIntSafe(env.EVIDENCE_BILL_CONCURRENCY, 2), 3)
  );
  const evidenceEndpointFanout = Math.max(
    1,
    Math.min(parseIntSafe(env.EVIDENCE_ENDPOINT_FANOUT, 3), 4)
  );
  const activityLookbackDays = Math.max(7, Math.min(parseIntSafe(env.ACTIVITY_LOOKBACK_DAYS, 30), 120));

  const memberResult = await runTimed(runId, "member_ingestion", async () =>
    runMemberIngestion({
      congress: config.congress,
      session: config.session,
      congressApiKey,
      govInfoApiKey,
      lookbackDays: activityLookbackDays,
    })
  );

  if (!memberResult.success || !memberResult.membersIndex) {
    throw new Error(`[scheduled] Member ingestion failed: ${memberResult.error ?? "unknown error"}`);
  }
  const membersIndex = memberResult.membersIndex;
  const previousActivityIndex = await readJsonFromR2<ActivityIndexJson>(
    env.DATA_BUCKET,
    buildActivitiesIndexKey()
  );
  const effectiveActivityIndex =
    (memberResult.activityIndex?.activities?.length ?? 0) > 0
      ? memberResult.activityIndex
      : previousActivityIndex;
  if ((memberResult.activityIndex?.activities?.length ?? 0) === 0 && previousActivityIndex?.activities?.length) {
    logEvent("activity_index_fallback_reused", {
      run_id: runId,
      previous_generated_at: previousActivityIndex.generated_at,
      previous_count: previousActivityIndex.activities.length,
    });
  }

  const billsByKey = collectUniqueBills(memberResult.memberActivities, effectiveActivityIndex);
  const evidencePipeline = await runTimed(runId, "bill_evidence_pipeline", async () =>
    buildBillEvidencePipeline(env.DATA_BUCKET, billsByKey, {
      runId,
      congressApiKey,
      session: config.session,
      maxBills: evidenceMaxBills,
      billConcurrency: evidenceBillConcurrency,
      endpointFanout: evidenceEndpointFanout,
    })
  );

  for (const memberActivity of memberResult.memberActivities) {
    for (const item of memberActivity.activities) {
      if (item.type !== "legislation_action" && item.type !== "roll_call_vote") continue;
      attachImpactEvidenceToBill(item.bill, evidencePipeline.impactByKey);
    }
  }
  for (const activity of effectiveActivityIndex?.activities ?? []) {
    attachImpactEvidenceToBill(activity.bill, evidencePipeline.impactByKey);
  }

  await runTimed(runId, "publish_member_activity_core", async () =>
    publishMemberActivity(
      env.DATA_BUCKET,
      membersIndex,
      memberResult.memberActivities,
      memberResult.windowEnd,
      effectiveActivityIndex
    )
  );
  await runTimed(runId, "publish_chamber_context", async () =>
    publishChamberContext(env.DATA_BUCKET, memberResult.windowEnd, memberResult.context)
  );

  const harnessRuntime = getHarnessRuntime();
  const fixtureMode = harnessRuntime.mode === "fixture";
  const shadowMode = fixtureMode ? true : parseBool(env.OPENROUTER_SHADOW_MODE, false);
  const canaryPercent = Math.max(0, Math.min(parseIntSafe(env.OPENROUTER_CANARY_PERCENT, 100), 100));
  const canaryValue = hashRunId(runId);
  const canaryEnabled = canaryValue < canaryPercent;
  const maxNewAnalyses = Math.max(1, parseIntSafe(env.OPENROUTER_MAX_NEW_ANALYSES, 20));
  const openrouterAppReferer = env.OPENROUTER_APP_REFERER?.trim();
  const openrouterAppTitle = env.OPENROUTER_APP_TITLE?.trim() || "daily_senate_update_worker";
  const qualityGateConfig: QualityGateConfig = {
    minClaimsCoveragePct: parsePct(env.QUALITY_MIN_CLAIMS_COVERAGE, 70),
    minQuoteValidityPct: parsePct(env.QUALITY_MIN_QUOTE_VALIDITY, 80),
    maxConfidenceMismatchPct: parsePct(env.QUALITY_MAX_CONFIDENCE_MISMATCH, 35),
    hardGates: parseBool(env.QUALITY_HARD_GATES, false),
  };
  let analysisResult: AnalyzeBillsResult | null = null;
  let synthesisErrors: SourceError[] = [];

  if (!fixtureMode && env.OPENROUTER_API_KEY?.trim() && canaryEnabled) {
    const models = parseCsvList(env.OPENROUTER_MODEL);
    try {
      analysisResult = await runTimed(runId, "openrouter_synthesis", async () =>
        enrichBillAnalyses(
          env.DATA_BUCKET,
          evidencePipeline.billInputs,
          memberResult.memberActivities,
          effectiveActivityIndex,
          env.OPENROUTER_API_KEY as string,
          models.length > 0 ? models : [...DEFAULT_OPENROUTER_MODELS],
          maxNewAnalyses,
          shadowMode,
          qualityGateConfig,
          openrouterAppReferer,
          openrouterAppTitle
        )
      );

      if (analysisResult && !shadowMode) {
        try {
          await runTimed(runId, "publish_member_activity_narrative", async () =>
            publishMemberActivity(
              env.DATA_BUCKET,
              membersIndex,
              memberResult.memberActivities,
              memberResult.windowEnd,
              effectiveActivityIndex
            )
          );
        } catch (error) {
          synthesisErrors.push({
            source: "congress",
            message: `Narrative publish failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }
      }
      if (analysisResult) {
        const attemptedAnalyses = analysisResult.analyzedCount + analysisResult.inputSkipCount;
        const fallbackRate =
          attemptedAnalyses > 0 ? analysisResult.fallbackCount / attemptedAnalyses : 0;
        if (fallbackRate > 0.2) {
          logEvent("openrouter_degradation_signal", {
            run_id: runId,
            fallback_rate: Number((fallbackRate * 100).toFixed(2)),
            analyzed_count: analysisResult.analyzedCount,
            fallback_count: analysisResult.fallbackCount,
            deferred_count: analysisResult.deferredCount,
          });
        }
      }
    } catch (error) {
      synthesisErrors.push({
        source: "congress",
        message: `OpenRouter synthesis failed but core publication remains available: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      logEvent("openrouter_synthesis_failed", {
        run_id: runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else if (fixtureMode) {
    synthesisErrors.push({
      source: "congress",
      message: "Harness fixture mode active; synthesis skipped",
    });
  } else if (!env.OPENROUTER_API_KEY?.trim()) {
    synthesisErrors.push({
      source: "congress",
      message: "OPENROUTER_API_KEY missing; synthesis skipped",
    });
  } else {
    synthesisErrors.push({
      source: "congress",
      message: `Synthesis skipped due to canary gating (${canaryValue} >= ${canaryPercent})`,
    });
  }

  let statePartial = false;
  if (config.targetState === "ALL") {
    const result = await runTimed(runId, "state_ingestion_all", async () =>
      runIngestionAllStates(config, STATE_CODES)
    );
    if (!result.success) {
      throw new Error(`[scheduled] Ingestion failed: ${result.error}`);
    }
    statePartial = result.partial;
    await runTimed(runId, "publish_state_snapshots_all", async () =>
      publishAllStatesToR2(env.DATA_BUCKET, result.perState)
    );
  } else {
    const result = await runTimed(runId, "state_ingestion_single", async () => runIngestion(config));
    if (!result.success) {
      throw new Error(`[scheduled] Ingestion failed: ${result.error}`);
    }
    if (!result.snapshot || !result.meta) {
      throw new Error("[scheduled] Ingestion succeeded but no data to publish");
    }
    statePartial = result.partial;
    await runTimed(runId, "publish_state_snapshots_single", async () =>
      publishToR2(env.DATA_BUCKET, result.snapshot as SnapshotJson, result.meta as MetaJson)
    );
  }

  const existingLedger = await readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey());
  const { ledger, overview } = await runTimed(runId, "build_vote_ledger", async () =>
    buildVoteLedgerUpdate(config, membersIndex, existingLedger)
  );
  const newVoteNumbers = diffVoteNumbers(ledger, existingLedger);
  const evidenceTargetVoteNumbers = Array.from(
    new Set([
      ...newVoteNumbers,
      ...buildPipelineMaterialization(ledger, overview, effectiveActivityIndex).briefing.items
        .slice(0, 6)
        .map((item) => item.vote_number),
    ])
  );
  await runTimed(runId, "publish_vote_ledger", async () =>
    writeJsonToR2(env.DATA_BUCKET, buildVoteLedgerKey(), ledger)
  );
  await runTimed(runId, "publish_session_overview", async () =>
    writeJsonToR2(env.DATA_BUCKET, buildSessionOverviewKey(), overview)
  );

  const allErrors = [
    ...memberResult.errors,
    ...evidencePipeline.errors,
    ...synthesisErrors,
  ];
  const coverage = summarizeCoverage(
    runId,
    evidencePipeline.processedBillCount,
    analysisResult?.claimsWithEvidenceRefPct ?? 0,
    analysisResult?.benefitMapWithEvidenceRefPct ?? 0,
    analysisResult?.likelyReasonsWithEvidenceRefPct ?? 0,
    analysisResult?.quoteValidityPct ?? 0,
    analysisResult?.confidenceCalibrationMismatchPct ?? 0,
    evidencePipeline.endpointSuccessRates,
    evidencePipeline.endpointFallbackRates,
    evidencePipeline.structuredAmountCount,
    evidencePipeline.recipientCount,
    evidencePipeline.stateSignalCount,
    statePartial || allErrors.length > 0,
    allErrors
  );
  await runTimed(runId, "publish_coverage_snapshot", async () =>
    writeJsonToR2(env.DATA_BUCKET, buildCoverageSnapshotKey(memberResult.windowEnd), coverage)
  );

  const materializeJob: PipelineJob = {
    type: "materialize_read_models",
    created_at: new Date().toISOString(),
    reason: "scheduled_ingestion_complete",
  };
  const queued = await runTimed(runId, "queue_materialization", async () =>
    enqueuePipelineJob(env, materializeJob)
  );
  if (!queued) {
    await runTimed(runId, "materialize_read_models_inline", async () =>
      materializeReadModels(env, ledger, overview, effectiveActivityIndex)
    );
  }

  if (evidenceTargetVoteNumbers.length > 0) {
    const evidenceJobs = evidenceTargetVoteNumbers.map<PipelineJob>((voteNumber) => ({
      type: "extract_vote_evidence",
      created_at: new Date().toISOString(),
      congress: ledger.congress,
      session: ledger.session,
      vote_number: voteNumber,
    }));
    const evidenceQueued = await runTimed(runId, "queue_vote_evidence", async () => {
      let allQueued = true;
      for (const job of evidenceJobs) {
        const queuedJob = await enqueuePipelineJob(env, job);
        if (!queuedJob) allQueued = false;
      }
      return allQueued;
    });
    if (!evidenceQueued) {
      await runTimed(runId, "extract_vote_evidence_inline", async () => {
        for (const job of evidenceJobs) {
          await processPipelineJob(job, env);
        }
      });
    }
  }

  logEvent("scheduled_ingestion_complete", {
    run_id: runId,
    duration_ms: Date.now() - startTime,
    target_state: config.targetState,
    bills_processed: coverage.bills_processed,
    claims_with_evidence_pct: coverage.pct_claims_with_evidence_refs,
    benefit_map_with_evidence_pct: analysisResult?.benefitMapWithEvidenceRefPct ?? 0,
    likely_reasons_with_evidence_pct: analysisResult?.likelyReasonsWithEvidenceRefPct ?? 0,
    quote_validity_pct: analysisResult?.quoteValidityPct ?? 0,
    confidence_mismatch_pct: analysisResult?.confidenceCalibrationMismatchPct ?? 0,
    partial: coverage.partial,
  });
}

/**
 * Scheduled handler for cron triggers.
 *
 * Uses ctx.waitUntil to ensure async work completes before the runtime
 * terminates the worker. Fails loudly on configuration errors.
 */
function handleScheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): void {
  applyHarnessEnv(env);
  logEvent("scheduled_trigger", {
    scheduled_for: new Date(controller.scheduledTime).toISOString(),
  });

  // Use ctx.waitUntil to ensure the async work completes
  // This prevents the runtime from terminating the worker prematurely
  ctx.waitUntil(
    runScheduledIngestion(env).catch((err) => {
      // Keep failure logs structured and avoid exposing full stack traces by default.
      logEvent("scheduled_ingestion_failed", {
        fatal: true,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    })
  );
}

async function processPipelineJob(job: PipelineJob, env: Env): Promise<void> {
  if (job.type === "materialize_read_models") {
    const [ledger, overview, activityIndex] = await Promise.all([
      readJsonFromR2<VoteLedger>(env.DATA_BUCKET, buildVoteLedgerKey()),
      readJsonFromR2<SessionOverview>(env.DATA_BUCKET, buildSessionOverviewKey()),
      readJsonFromR2<ActivityIndexJson>(env.DATA_BUCKET, buildActivitiesIndexKey()),
    ]);
    if (!ledger || !overview) {
      throw new Error("Materialization job missing ledger or overview in storage");
    }
    await materializeReadModels(env, ledger, overview, activityIndex);
    return;
  }

  if (job.type === "historical_backfill") {
    await processHistoricalBackfillJob(job, env);
    return;
  }

  if (job.type === "extract_vote_evidence") {
    await processExtractVoteEvidenceJob(job, env);
  }
}

function handleQueue(
  batch: MessageBatch<PipelineJob>,
  env: Env,
  ctx: ExecutionContext
): void {
  applyHarnessEnv(env);
  for (const message of batch.messages) {
    ctx.waitUntil(
      processPipelineJob(message.body, env)
        .then(() => message.ack())
        .catch((error) => {
          logEvent("pipeline_queue_job_failed", {
            type: message.body.type,
            error: error instanceof Error ? error.message : String(error),
          });
          message.retry();
        })
    );
  }
}

// ============================================================================
// Export Worker
// ============================================================================

export default {
  fetch: handleFetch,
  scheduled: handleScheduled,
  queue: handleQueue,
} satisfies ExportedHandler<Env, PipelineJob>;
