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
import { harvestBillEvidence, EVIDENCE_ENDPOINT_TIERS } from "./bill-evidence";
import { buildTrendSnapshot, extractBillImpactEvidence } from "./impact-extract";
import {
  analyzeBillsWithCache,
  DEFAULT_OPENROUTER_MODEL,
  type AnalyzeBillsResult,
} from "./openrouter";
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
  SourceError,
} from "./types";
import { STATE_CODES } from "./states";
import {
  buildLatestKey,
  buildMetaKey,
  buildSnapshotKey,
  buildMemberKeys,
  buildMemberLatestKey,
  buildMembersIndexKey,
  buildActivitiesIndexKey,
  buildVoteLedgerKey,
  buildSessionOverviewKey,
  buildBillEvidenceKey,
  buildBillTrendSnapshotKey,
  buildCoverageSnapshotKey,
  publishToR2,
  readJsonFromR2,
  writeJsonToR2,
} from "./storage";
import { mapWithConcurrency } from "./concurrency";

// ============================================================================
// Environment Types
// ============================================================================

interface Env {
  DATA_BUCKET: R2Bucket;
  CONGRESS: string;
  SESSION: string;
  TARGET_STATE: string;
  CONGRESS_API_KEY: string;
  GOVINFO_API_KEY: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  OPENROUTER_SHADOW_MODE?: string;
  OPENROUTER_CANARY_PERCENT?: string;
  OPENROUTER_MAX_NEW_ANALYSES?: string;
  DATA_FRESHNESS_MAX_HOURS?: string;
  EVIDENCE_MAX_BILLS?: string;
  EVIDENCE_BILL_CONCURRENCY?: string;
  EVIDENCE_ENDPOINT_FANOUT?: string;
  ACTIVITY_LOOKBACK_DAYS?: string;
}

// ============================================================================
// Headers & Helpers
// ============================================================================

const corsHeaders: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
  ...corsHeaders,
};

// Cache-Control values per SPEC.md
const cacheHealth = "s-maxage=60, max-age=0, must-revalidate";
const cacheLatest = "s-maxage=300, stale-while-revalidate=86400";
const cacheSnapshot = "s-maxage=86400, stale-while-revalidate=604800";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init?.headers ?? {}),
    },
  });

const notFoundResponse = (path: string) =>
  jsonResponse(
    {
      error: "not_found",
      message: "Resource not found",
      path,
    },
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

function computePct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
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
    endpoint_success_rates: endpointSuccessRates,
    endpoint_fallback_rates: endpointFallbackRates,
    partial,
    errors,
  };
}

// ============================================================================
// R2 Storage
// ============================================================================
// ============================================================================
// HTTP Handler
// ============================================================================

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);

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

  if (!env.CONGRESS_API_KEY) {
    errors.push("CONGRESS_API_KEY is missing");
  }
  if (!env.GOVINFO_API_KEY) {
    errors.push("GOVINFO_API_KEY is missing");
  }

  // Fail loudly if any validation errors
  if (errors.length > 0) {
    const errorMsg = `[scheduled] CONFIGURATION ERROR:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  return { congress, session, targetState, congressApiKey: env.CONGRESS_API_KEY };
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
  model: string,
  maxNewAnalyses: number,
  shadowMode: boolean
): Promise<AnalyzeBillsResult | null> {
  if (billInputs.length === 0) {
    console.log("[openrouter] No bill refs found for analysis enrichment");
    return null;
  }

  const result = await analyzeBillsWithCache(bucket, billInputs, {
    apiKey,
    model,
    maxNewAnalyses,
    appReferer: "https://localhost",
    appTitle: "daily_senate_update_worker",
    timeoutMs: 30_000,
    maxRetries: 2,
    analysisConcurrency: 2,
  });

  console.log(
    `[openrouter] Analysis enrichment complete: cache hits=${result.cacheHitCount}, new=${result.analyzedCount}, skipped=${result.skippedCount}, claim-coverage=${result.claimsWithEvidenceRefPct}%`
  );

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

/**
 * Core ingestion logic, separated for use with ctx.waitUntil.
 */
async function runScheduledIngestion(env: Env): Promise<void> {
  const runId = makeRunId();
  const startTime = Date.now();
  logEvent("scheduled_ingestion_start", {
    run_id: runId,
    timestamp: new Date().toISOString(),
  });

  const config = validateEnv(env);
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
      congressApiKey: env.CONGRESS_API_KEY,
      govInfoApiKey: env.GOVINFO_API_KEY,
      lookbackDays: activityLookbackDays,
    })
  );

  if (!memberResult.success || !memberResult.membersIndex) {
    throw new Error(`[scheduled] Member ingestion failed: ${memberResult.error ?? "unknown error"}`);
  }
  const membersIndex = memberResult.membersIndex;

  const billsByKey = collectUniqueBills(memberResult.memberActivities, memberResult.activityIndex);
  const evidencePipeline = await runTimed(runId, "bill_evidence_pipeline", async () =>
    buildBillEvidencePipeline(env.DATA_BUCKET, billsByKey, {
      runId,
      congressApiKey: env.CONGRESS_API_KEY,
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
  for (const activity of memberResult.activityIndex?.activities ?? []) {
    attachImpactEvidenceToBill(activity.bill, evidencePipeline.impactByKey);
  }

  await runTimed(runId, "publish_member_activity_core", async () =>
    publishMemberActivity(
      env.DATA_BUCKET,
      membersIndex,
      memberResult.memberActivities,
      memberResult.windowEnd,
      memberResult.activityIndex
    )
  );

  const shadowMode = parseBool(env.OPENROUTER_SHADOW_MODE, false);
  const canaryPercent = Math.max(0, Math.min(parseIntSafe(env.OPENROUTER_CANARY_PERCENT, 100), 100));
  const canaryValue = hashRunId(runId);
  const canaryEnabled = canaryValue < canaryPercent;
  const maxNewAnalyses = Math.max(1, parseIntSafe(env.OPENROUTER_MAX_NEW_ANALYSES, 20));
  let analysisResult: AnalyzeBillsResult | null = null;
  let synthesisErrors: SourceError[] = [];

  if (env.OPENROUTER_API_KEY?.trim() && canaryEnabled) {
    const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
    try {
      analysisResult = await runTimed(runId, "openrouter_synthesis", async () =>
        enrichBillAnalyses(
          env.DATA_BUCKET,
          evidencePipeline.billInputs,
          memberResult.memberActivities,
          memberResult.activityIndex,
          env.OPENROUTER_API_KEY as string,
          model,
          maxNewAnalyses,
          shadowMode
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
              memberResult.activityIndex
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
        const analyzedTotal = analysisResult.analyzedCount + analysisResult.skippedCount;
        const skipRate = analyzedTotal > 0 ? analysisResult.skippedCount / analyzedTotal : 0;
        if (skipRate > 0.2) {
          logEvent("openrouter_degradation_signal", {
            run_id: runId,
            skip_rate: Number((skipRate * 100).toFixed(2)),
            analyzed_count: analysisResult.analyzedCount,
            skipped_count: analysisResult.skippedCount,
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

  logEvent("scheduled_ingestion_complete", {
    run_id: runId,
    duration_ms: Date.now() - startTime,
    target_state: config.targetState,
    bills_processed: coverage.bills_processed,
    claims_with_evidence_pct: coverage.pct_claims_with_evidence_refs,
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
  console.log(
    `[scheduled] Cron scheduled at: ${new Date(controller.scheduledTime).toISOString()}`
  );

  // Use ctx.waitUntil to ensure the async work completes
  // This prevents the runtime from terminating the worker prematurely
  ctx.waitUntil(
    runScheduledIngestion(env).catch((err) => {
      // Log and re-throw to ensure the cron run is marked as failed
      console.error("[scheduled] FATAL: Scheduled ingestion failed");
      console.error("[scheduled] Error:", err instanceof Error ? err.message : String(err));
      if (err instanceof Error && err.stack) {
        console.error("[scheduled] Stack:", err.stack);
      }
      throw err;
    })
  );
}

// ============================================================================
// Export Worker
// ============================================================================

export default {
  fetch: handleFetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;
