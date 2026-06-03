import { mapWithConcurrency } from "./concurrency";
import {
  buildBillKey,
  buildCongressUrl,
  normalizeBillNumber,
  normalizeBillType,
} from "./sources/congress-client";
import { fetchJsonWithRetry, type FetchConfig } from "./fetch";
import type {
  BillEvidenceRaw,
  BillRef,
  EvidenceEndpoint,
  EvidenceEndpointStatus,
} from "./types";

export const EVIDENCE_ENDPOINT_TIERS: Record<EvidenceEndpoint, 1 | 2 | 3> = {
  detail: 1,
  summaries: 1,
  subjects: 1,
  committees: 1,
  actions: 1,
  text: 2,
  cbo_cost_estimates: 2,
  committee_reports: 2,
  amendments: 3,
  related_bills: 3,
  cosponsors: 3,
};

interface EndpointSpec {
  endpoint: EvidenceEndpoint;
  paths: string[];
}

interface EndpointFetchResult {
  endpoint: EvidenceEndpoint;
  url: string;
  attemptedUrls: string[];
  resolvedPath: string;
  fallbackUsed: boolean;
  ok: boolean;
  fetchedAt: string;
  statusCode?: number;
  error?: string;
  itemCount?: number;
  payload?: Record<string, unknown>;
}

export interface BillEvidenceHarvestOptions {
  endpointFanout?: number;
  fetchConfig?: FetchConfig;
}

export interface BillEvidenceHarvestResult {
  evidence: BillEvidenceRaw;
  error?: string;
}

function estimateItemCount(endpoint: EvidenceEndpoint, data: Record<string, unknown>): number | undefined {
  if (endpoint === "detail") return 1;
  const commonArrays = [
    data[endpoint],
    data.items,
    data.results,
    data.actions,
    data.textVersions,
    data.amendments,
    data.relatedBills,
    data.cosponsors,
    data.committeeReports,
    data.costEstimates,
    data.summaries,
  ];
  for (const candidate of commonArrays) {
    if (Array.isArray(candidate)) return candidate.length;
  }
  return undefined;
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function collectTextFromUnknown(
  value: unknown,
  out: string[],
  seen: Set<string>,
  depth = 0
): void {
  if (depth > 3 || out.length >= 120) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.length < 16) return;
    const normalized = trimmed.replace(/\s+/g, " ");
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized.slice(0, 500));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextFromUnknown(item, out, seen, depth + 1);
      if (out.length >= 120) return;
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectTextFromUnknown(nested, out, seen, depth + 1);
    if (out.length >= 120) return;
  }
}

function collectSourceText(
  ref: BillRef,
  endpointPayloads: Array<EndpointFetchResult>
): string[] {
  const text: string[] = [];
  const seen = new Set<string>();

  const seed = [
    ref.title,
    ref.summary,
    ref.policy_area,
    ...(ref.subjects ?? []),
    ref.latest_action?.text,
  ];
  for (const item of seed) {
    const normalized = firstString(item);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    text.push(normalized.slice(0, 500));
  }

  for (const payload of endpointPayloads) {
    if (!payload.ok || !payload.payload) continue;
    collectTextFromUnknown(payload.payload, text, seen);
  }
  return text.slice(0, 120);
}

function buildEndpointSpecs(basePath: string): EndpointSpec[] {
  return [
    { endpoint: "detail", paths: [basePath] },
    { endpoint: "summaries", paths: [`${basePath}/summaries`] },
    { endpoint: "subjects", paths: [`${basePath}/subjects`] },
    { endpoint: "committees", paths: [`${basePath}/committees`] },
    { endpoint: "actions", paths: [`${basePath}/actions`] },
    { endpoint: "text", paths: [`${basePath}/text`, `${basePath}/texts`] },
    { endpoint: "amendments", paths: [`${basePath}/amendments`] },
    {
      endpoint: "cbo_cost_estimates",
      paths: [`${basePath}/cbo-cost-estimates`, `${basePath}/cbocostestimates`],
    },
    {
      endpoint: "committee_reports",
      paths: [`${basePath}/committee-reports`, `${basePath}/committeereports`],
    },
    {
      endpoint: "related_bills",
      paths: [`${basePath}/relatedbills`, `${basePath}/related-bills`],
    },
    { endpoint: "cosponsors", paths: [`${basePath}/cosponsors`] },
  ];
}

function toEndpointStatus(result: EndpointFetchResult): EvidenceEndpointStatus {
  return {
    tier: EVIDENCE_ENDPOINT_TIERS[result.endpoint],
    ok: result.ok,
    fetched_at: result.fetchedAt,
    url: result.url,
    attempted_urls: result.attemptedUrls,
    resolved_path: result.resolvedPath,
    fallback_used: result.fallbackUsed,
    error: result.error,
    item_count: result.itemCount,
  };
}

function isIgnorableOptionalEndpointMiss(result: EndpointFetchResult): boolean {
  return !result.ok && result.statusCode === 404 && EVIDENCE_ENDPOINT_TIERS[result.endpoint] > 1;
}

export async function harvestBillEvidence(
  ref: BillRef,
  apiKey: string,
  options: BillEvidenceHarvestOptions = {}
): Promise<BillEvidenceHarvestResult> {
  const billType = normalizeBillType(ref.type);
  const billNumber = normalizeBillNumber(ref.number);
  const generatedAt = new Date().toISOString();
  const billKey = buildBillKey(ref);
  if (!billType || !billNumber) {
    return {
      evidence: {
        schema_version: 1,
        bill_key: billKey,
        generated_at: generatedAt,
        bill: {
          congress: ref.congress,
          type: ref.type,
          number: ref.number,
          title: ref.title,
          summary: ref.summary,
          policy_area: ref.policy_area,
          subjects: ref.subjects,
          introduced_date: ref.introduced_date,
          latest_action: ref.latest_action,
        },
        endpoints: {},
        source_availability: {},
        source_text: [],
      },
      error: "Missing bill type or number",
    };
  }

  const endpointFanout = Math.max(1, Math.min(options.endpointFanout ?? 3, 4));
  const fetchConfig = options.fetchConfig ?? {};
  const basePath = `/bill/${ref.congress}/${billType}/${billNumber}`;
  const specs = buildEndpointSpecs(basePath);

  const endpointResults = await mapWithConcurrency(specs, endpointFanout, async (spec) => {
    const fetchedAt = new Date().toISOString();
    const attemptedUrls: string[] = [];
    const errors: string[] = [];
    let selectedUrl = "";
    let selectedPath = spec.paths[0] ?? "";
    let selectedPayload: Record<string, unknown> | undefined;
    let fallbackUsed = false;
    let lastStatusCode: number | undefined;

    for (let i = 0; i < spec.paths.length; i++) {
      const path = spec.paths[i];
      const url = buildCongressUrl(path, {}, apiKey);
      attemptedUrls.push(url);
      const result = await fetchJsonWithRetry<Record<string, unknown>>(url, fetchConfig);
      lastStatusCode = result.statusCode;
      if (result.success && result.data) {
        selectedUrl = url;
        selectedPath = path;
        selectedPayload = result.data;
        fallbackUsed = i > 0;
        break;
      }
      errors.push(result.error ?? `Endpoint fetch failure for ${path}`);
    }

    if (!selectedPayload) {
      return {
        endpoint: spec.endpoint,
        url: attemptedUrls[0] ?? buildCongressUrl(selectedPath, {}, apiKey),
        attemptedUrls,
        resolvedPath: selectedPath,
        fallbackUsed: false,
        ok: false,
        fetchedAt,
        statusCode: lastStatusCode,
        error: errors[errors.length - 1] ?? "Unknown endpoint fetch failure",
      } satisfies EndpointFetchResult;
    }

    return {
      endpoint: spec.endpoint,
      url: selectedUrl,
      attemptedUrls,
      resolvedPath: selectedPath,
      fallbackUsed,
      ok: true,
      fetchedAt,
      statusCode: 200,
      payload: selectedPayload,
      itemCount: estimateItemCount(spec.endpoint, selectedPayload),
    } satisfies EndpointFetchResult;
  });

  const endpoints: Partial<Record<EvidenceEndpoint, EvidenceEndpointStatus>> = {};
  const sourceAvailability: Partial<Record<EvidenceEndpoint, boolean>> = {};
  for (const result of endpointResults) {
    endpoints[result.endpoint] = toEndpointStatus(result);
    sourceAvailability[result.endpoint] = result.ok;
  }

  const sourceText = collectSourceText(ref, endpointResults);
  const firstError = endpointResults.find((r) => !r.ok && !isIgnorableOptionalEndpointMiss(r))?.error;

  return {
    evidence: {
      schema_version: 1,
      bill_key: billKey,
      generated_at: generatedAt,
      bill: {
        congress: ref.congress,
        type: ref.type,
        number: ref.number,
        title: ref.title,
        summary: ref.summary,
        policy_area: ref.policy_area,
        subjects: ref.subjects,
        introduced_date: ref.introduced_date,
        latest_action: ref.latest_action,
      },
      endpoints,
      source_availability: sourceAvailability,
      source_text: sourceText,
    },
    error: firstError,
  };
}
