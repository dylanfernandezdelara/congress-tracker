import { daysAgoLookbackStartIso } from "../../../../shared/lookback";
import { parseUsStateCode } from "../../../../shared/us-states";
import type { Env } from "../config";
import type { BillSponsorRecord } from "../d1/sponsors";
import {
  parseLifecycleActions,
  type CongressAction,
  type ParsedLifecycleMilestones,
} from "../lifecycle/parse-actions";
import type { BillRef } from "../types";
import { stripHtmlToText } from "./html-clean";
import { fetchJson } from "./http";

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

/** UTC start date for feed/vote lookback: today minus `days` (legacy days-ago window). */
export function lookbackStartIso(days: number, asOf: Date = new Date()): string {
  return daysAgoLookbackStartIso(days, asOf);
}
