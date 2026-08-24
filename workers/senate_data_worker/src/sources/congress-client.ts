import { daysAgoLookbackStartIso } from "../../../../shared/lookback";
import { parseUsStateCode } from "../../../../shared/us-states";
import type { Env } from "../config";
import { PUBLIC_LAWS_PAGE_SIZE } from "../constants";
import {
  parseLifecycleActions,
  type CongressAction,
  type ParsedLifecycleMilestones,
} from "../lifecycle/parse-actions";
import type { BillRef, BillSponsorRecord } from "../types";
import type { FeedChamber } from "../../../../shared/feed-api-types";
import { stripHtmlToText } from "./html-clean";
import { fetchJson, fetchJsonWithMeta, nextPageUrl } from "./http";
import { parsePublicLawsPage, type PublicLawRecord } from "./public-laws";

export type { PublicLawRecord };

interface BillSummary {
  text?: string;
  updateDate?: string;
}

interface BillSummariesResponse {
  summaries?: BillSummary[];
}

interface CongressBillSponsor {
  bioguideId?: string;
  state?: string;
  fullName?: string;
  party?: string;
}

interface BillDetail {
  title?: string;
  policyArea?: { name?: string };
  introducedDate?: string;
  sponsors?: CongressBillSponsor[];
}

interface BillDetailResponse {
  bill?: BillDetail;
}

interface BillActionsResponse {
  actions?: CongressAction[];
}

export interface BillSummaryBundle {
  title: string | null;
  policyArea: string | null;
  rawSummaryText: string | null;
  introducedDate: string | null;
  /** Primary sponsors from the bill detail payload (state denormalized). */
  sponsors: BillSponsorRecord[];
}

export function parseBillSponsors(
  raw: CongressBillSponsor[] | undefined
): BillSponsorRecord[] {
  if (!raw?.length) return [];
  const out: BillSponsorRecord[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const bioguideId = item.bioguideId?.trim();
    // Prefer known USPS codes so feed ?state= filters stay aligned with the UI list.
    const state = parseUsStateCode(item.state);
    if (!bioguideId || !state) continue;
    if (seen.has(bioguideId)) continue;
    seen.add(bioguideId);
    out.push({
      bioguideId,
      state,
      fullName: item.fullName?.trim() || null,
      party: item.party?.trim() || null,
      isPrimary: true,
    });
  }
  return out;
}

export interface BillLifecycleSource {
  introducedDate: string | null;
  milestones: ParsedLifecycleMilestones;
}

function billPathSegment(type: string): string {
  const t = type.toLowerCase();
  if (t === "hr") return "hr";
  if (t === "s") return "s";
  if (t === "hres") return "hres";
  if (t === "sres") return "sres";
  if (t === "hjres") return "hjres";
  if (t === "sjres") return "sjres";
  return t;
}

function billApiBase(bill: BillRef): string {
  const seg = billPathSegment(bill.type);
  return `https://api.congress.gov/v3/bill/${bill.congress}/${seg}/${bill.number}`;
}

export async function fetchBillSummaryBundle(
  env: Env,
  bill: BillRef
): Promise<BillSummaryBundle> {
  const apiKey = env.CONGRESS_API_KEY;
  const base = billApiBase(bill);

  const [detailRes, summariesRes] = await Promise.all([
    fetchJson<BillDetailResponse>(`${base}?format=json&api_key=${apiKey}`),
    fetchJson<BillSummariesResponse>(`${base}/summaries?format=json&api_key=${apiKey}`),
  ]);

  const summaries = summariesRes.summaries ?? [];
  const latest = summaries.length
    ? [...summaries].sort((a, b) => (b.updateDate ?? "").localeCompare(a.updateDate ?? ""))[0]
    : null;

  return {
    title: detailRes.bill?.title ?? null,
    policyArea: detailRes.bill?.policyArea?.name ?? null,
    rawSummaryText: latest?.text ? stripHtmlToText(latest.text) : null,
    introducedDate: detailRes.bill?.introducedDate?.slice(0, 10) ?? null,
    sponsors: parseBillSponsors(detailRes.bill?.sponsors),
  };
}

/**
 * Fetch bill actions + introducedDate for lifecycle tracking.
 * One actions page (limit=250) is enough for presidential milestones.
 */
export async function fetchBillLifecycleSource(
  env: Env,
  bill: BillRef
): Promise<BillLifecycleSource> {
  const apiKey = env.CONGRESS_API_KEY;
  const base = billApiBase(bill);

  const [detailRes, actionsRes] = await Promise.all([
    fetchJson<BillDetailResponse>(`${base}?format=json&api_key=${apiKey}`),
    fetchJson<BillActionsResponse>(
      `${base}/actions?format=json&limit=250&api_key=${apiKey}`
    ),
  ]);

  return {
    introducedDate: detailRes.bill?.introducedDate?.slice(0, 10) ?? null,
    milestones: parseLifecycleActions(actionsRes.actions ?? []),
  };
}

/**
 * List public laws for a congress from Congress.gov `/v3/law/{congress}/pub`.
 * Default list order is not newest-first, so callers sort by `becameLawDate`.
 * Walks pagination when a congress exceeds one page (~250).
 */
export async function fetchRecentPublicLaws(
  env: Env,
  congress: number,
  pageSize: number = PUBLIC_LAWS_PAGE_SIZE
): Promise<PublicLawRecord[]> {
  const apiKey = env.CONGRESS_API_KEY;
  const limit = Math.max(1, Math.min(250, Math.floor(pageSize)));
  const all: PublicLawRecord[] = [];
  const seen = new Set<string>();
  let url: string | null =
    `https://api.congress.gov/v3/law/${congress}/pub?format=json&limit=${limit}&api_key=${apiKey}`;
  let pages = 0;

  while (url && pages < 8) {
    pages += 1;
    const data: unknown = await fetchJson(url);
    const page = parsePublicLawsPage(data);
    for (const law of page.laws) {
      const key = `${law.congress}:${law.billType}:${law.billNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(law);
    }
    url = page.nextUrl ? nextPageUrl(page.nextUrl, apiKey) : null;
  }

  all.sort((a, b) => {
    const byDate = b.becameLawDate.localeCompare(a.becameLawDate);
    if (byDate !== 0) return byDate;
    return b.publicLaw.localeCompare(a.publicLaw);
  });
  return all;
}

/** UTC start date for feed/vote lookback: today minus `days` (legacy days-ago window). */
export function lookbackStartIso(days: number, asOf: Date = new Date()): string {
  return daysAgoLookbackStartIso(days, asOf);
}

export interface CongressCommitteeActivity {
  name?: string;
  date?: string;
}

export interface CongressSubcommittee {
  name?: string;
  systemCode?: string;
  activities?: CongressCommitteeActivity[];
}

export interface CongressBillCommittee {
  name?: string;
  systemCode?: string;
  chamber?: string;
  type?: string;
  activities?: CongressCommitteeActivity[];
  subcommittees?: CongressSubcommittee[];
}

export interface BillCommitteesSource {
  committees: CongressBillCommittee[];
  actions: CongressAction[];
  rateLimitRemaining: number | null;
}

function asFeedChamber(raw: string | undefined): FeedChamber | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (t === "house") return "House";
  if (t === "senate") return "Senate";
  return null;
}

export async function fetchBillCommitteesSource(
  env: Env,
  bill: BillRef
): Promise<BillCommitteesSource> {
  const apiKey = env.CONGRESS_API_KEY;
  const base = billApiBase(bill);

  const [committeesMeta, actionsMeta] = await Promise.all([
    fetchJsonWithMeta<{ committees?: CongressBillCommittee[] }>(
      `${base}/committees?format=json&limit=50&api_key=${apiKey}`
    ),
    fetchJsonWithMeta<BillActionsResponse>(
      `${base}/actions?format=json&limit=250&api_key=${apiKey}`
    ),
  ]);

  const remaining = [committeesMeta.rateLimitRemaining, actionsMeta.rateLimitRemaining]
    .filter((n): n is number => n != null)
    .reduce<number | null>((min, n) => (min == null ? n : Math.min(min, n)), null);

  return {
    committees: committeesMeta.data.committees ?? [],
    actions: actionsMeta.data.actions ?? [],
    rateLimitRemaining: remaining,
  };
}

export interface CongressRosterCommittee {
  name?: string;
  systemCode?: string;
  chamber?: string;
  committeeTypeCode?: string;
  subcommittees?: Array<{ name?: string; systemCode?: string }>;
}

export async function fetchCongressCommitteeRoster(
  env: Env,
  congress: number
): Promise<
  Array<{
    systemCode: string;
    chamber: FeedChamber;
    name: string;
    committeeType: string;
    parentSystemCode: string | null;
  }>
> {
  const apiKey = env.CONGRESS_API_KEY;
  const { data } = await fetchJsonWithMeta<{ committees?: CongressRosterCommittee[] }>(
    `https://api.congress.gov/v3/committee/${congress}?format=json&limit=250&api_key=${apiKey}`
  );
  const out: Array<{
    systemCode: string;
    chamber: FeedChamber;
    name: string;
    committeeType: string;
    parentSystemCode: string | null;
  }> = [];

  for (const c of data.committees ?? []) {
    const chamber = asFeedChamber(c.chamber);
    const systemCode = c.systemCode?.trim();
    const name = c.name?.trim();
    if (!chamber || !systemCode || !name) continue;
    const committeeType = c.committeeTypeCode?.trim() || "Other";
    // Congress.gov lists subcommittees both nested under parents and as top-level
    // rows. Keep only nested copies so upsert cannot wipe parent_system_code.
    if (committeeType === "Subcommittee" || /subcommittee$/i.test(name)) continue;
    out.push({
      systemCode,
      chamber,
      name,
      committeeType,
      parentSystemCode: null,
    });
    for (const sc of c.subcommittees ?? []) {
      const scCode = sc.systemCode?.trim();
      const scName = sc.name?.trim();
      if (!scCode || !scName) continue;
      out.push({
        systemCode: scCode,
        chamber,
        name: scName,
        committeeType: "Subcommittee",
        parentSystemCode: systemCode,
      });
    }
  }
  return out;
}

export interface CommitteeBillListItem {
  congress: number;
  type: string;
  number: number;
  relationshipType: string | null;
  actionDate: string | null;
}

export async function fetchCommitteeBillsPage(
  env: Env,
  params: {
    chamber: "house" | "senate";
    systemCode: string;
    fromDateTime: string;
    offset?: number;
    limit?: number;
  }
): Promise<{
  bills: CommitteeBillListItem[];
  nextOffset: number | null;
  totalCount: number | null;
  rateLimitRemaining: number | null;
}> {
  const apiKey = env.CONGRESS_API_KEY;
  const limit = params.limit ?? 250;
  const offset = params.offset ?? 0;
  const url =
    `https://api.congress.gov/v3/committee/${params.chamber}/${params.systemCode}/bills` +
    `?format=json&limit=${limit}&offset=${offset}` +
    `&fromDateTime=${encodeURIComponent(params.fromDateTime)}&api_key=${apiKey}`;

  const { data, rateLimitRemaining } = await fetchJsonWithMeta<{
    "committee-bills"?: { bills?: Array<Record<string, unknown>> };
    pagination?: { count?: number; next?: string };
  }>(url);

  const raw = data["committee-bills"]?.bills ?? [];
  const bills: CommitteeBillListItem[] = [];
  for (const item of raw) {
    const congress = Number(item.congress);
    // Congress.gov uses billNumber/billType on committee bill lists; accept
    // number/type as a defensive fallback for older fixtures.
    const number = Number(item.billNumber ?? item.number);
    const typeRaw = item.billType ?? item.type;
    const type = typeof typeRaw === "string" ? typeRaw : "";
    if (!Number.isFinite(congress) || !Number.isFinite(number) || !type) continue;
    bills.push({
      congress,
      type,
      number,
      relationshipType:
        typeof item.relationshipType === "string" ? item.relationshipType : null,
      actionDate: typeof item.actionDate === "string" ? item.actionDate : null,
    });
  }

  const next = nextPageUrl(data.pagination?.next, apiKey);
  let nextOffset: number | null = null;
  if (next) {
    try {
      const parsed = new URL(next);
      const off = parsed.searchParams.get("offset");
      nextOffset = off != null ? Number.parseInt(off, 10) : offset + limit;
      if (!Number.isFinite(nextOffset)) nextOffset = null;
    } catch {
      nextOffset = offset + limit;
    }
  }

  return {
    bills,
    nextOffset,
    totalCount:
      typeof data.pagination?.count === "number" ? data.pagination.count : null,
    rateLimitRemaining,
  };
}

export { asFeedChamber };
