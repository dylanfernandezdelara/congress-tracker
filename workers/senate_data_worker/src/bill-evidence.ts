import { mapWithConcurrency } from "./concurrency";
import { buildBillKey } from "./congress";
import { fetchJsonWithRetry, type FetchConfig } from "./fetch";
import type {
  BillEvidenceRaw,
  BillRef,
  EvidenceEndpoint,
  EvidenceEndpointStatus,
} from "./types";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

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
  path: string;
}

interface EndpointFetchResult {
  endpoint: EvidenceEndpoint;
  url: string;
  ok: boolean;
  fetchedAt: string;
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

function buildCongressUrl(
  path: string,
  params: Record<string, string | number | boolean>,
  apiKey: string
): string {
  const url = new URL(`${CONGRESS_API_BASE}${path}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("api_key", apiKey);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function normalizeBillType(value: string): string {
  const cleaned = value.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
  if (!cleaned) return "";
  if (cleaned === "hr") return "hr";
  if (cleaned === "s") return "s";
  if (cleaned === "hres") return "hres";
  if (cleaned === "sres") return "sres";
  if (cleaned === "hjres") return "hjres";
  if (cleaned === "sjres") return "sjres";
  if (cleaned === "hconres") return "hconres";
  if (cleaned === "sconres") return "sconres";
  return cleaned;
}

function normalizeBillNumber(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "";
  const match = cleaned.match(/\d+/);
  return match ? match[0] : cleaned;
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
    { endpoint: "detail", path: basePath },
    { endpoint: "summaries", path: `${basePath}/summaries` },
    { endpoint: "subjects", path: `${basePath}/subjects` },
    { endpoint: "committees", path: `${basePath}/committees` },
    { endpoint: "actions", path: `${basePath}/actions` },
    { endpoint: "text", path: `${basePath}/text` },
    { endpoint: "amendments", path: `${basePath}/amendments` },
    { endpoint: "cbo_cost_estimates", path: `${basePath}/cbo-cost-estimates` },
    { endpoint: "committee_reports", path: `${basePath}/committee-reports` },
    { endpoint: "related_bills", path: `${basePath}/related-bills` },
    { endpoint: "cosponsors", path: `${basePath}/cosponsors` },
  ];
}

function toEndpointStatus(result: EndpointFetchResult): EvidenceEndpointStatus {
  return {
    tier: EVIDENCE_ENDPOINT_TIERS[result.endpoint],
    ok: result.ok,
    fetched_at: result.fetchedAt,
    url: result.url,
    error: result.error,
    item_count: result.itemCount,
  };
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
    const url = buildCongressUrl(spec.path, {}, apiKey);
    const result = await fetchJsonWithRetry<Record<string, unknown>>(url, fetchConfig);
    if (!result.success || !result.data) {
      return {
        endpoint: spec.endpoint,
        url,
        ok: false,
        fetchedAt,
        error: result.error ?? "Unknown endpoint fetch failure",
      } satisfies EndpointFetchResult;
    }
    return {
      endpoint: spec.endpoint,
      url,
      ok: true,
      fetchedAt,
      payload: result.data,
      itemCount: estimateItemCount(spec.endpoint, result.data),
    } satisfies EndpointFetchResult;
  });

  const endpoints: Partial<Record<EvidenceEndpoint, EvidenceEndpointStatus>> = {};
  const sourceAvailability: Partial<Record<EvidenceEndpoint, boolean>> = {};
  for (const result of endpointResults) {
    endpoints[result.endpoint] = toEndpointStatus(result);
    sourceAvailability[result.endpoint] = result.ok;
  }

  const sourceText = collectSourceText(ref, endpointResults);
  const firstError = endpointResults.find((r) => !r.ok)?.error;

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
