import { inclusiveLookbackStartIso } from "../../../../shared/lookback";
import {
  INTRO_DETAIL_FETCHES_PER_RUN,
  INTRO_DISCOVERY_MAX_PAGES_PER_TYPE,
  INTRO_DISCOVERY_PAGE_SIZE,
  INTRO_FEED_MAX_NEW,
  INTRO_LOOKBACK_DAYS,
} from "../constants";
import type { Env } from "../config";
import { normalizeBillType } from "./bill-type";
import { fetchJson, fetchJsonWithMeta, nextPageUrl } from "./http";

/** Substantive bills only — resolutions would consume the intro cap. */
export const INTRO_DISCOVERY_BILL_TYPES = ["hr", "s"] as const;

export interface IntroducedBillListItem {
  congress: number;
  type: string;
  number: number;
  title: string | null;
  introducedDate: string | null;
  latestActionDate: string | null;
  latestActionText: string | null;
}

export interface RecentIntroducedBill extends IntroducedBillListItem {
  introducedDate: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function isoDate(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * Congress.gov list `latestAction.text` for a first-day filing.
 * Same-day referral often replaces "Introduced in …" as the latest action.
 */
export function looksLikeIntroductionAction(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  if (t.includes("introduced in")) return true;
  if (t.includes("read twice and referred")) return true;
  return false;
}

/** Same-day referral often replaces "Introduced in …" as latestAction. Last-resort detail hint. */
export function looksLikeSameDayReferralAction(text: string | null | undefined): boolean {
  if (!text) return false;
  return /^referred to (the )?(house |senate )?(committee|comm\.)/.test(text.trim().toLowerCase());
}

export function parseIntroducedBillListItem(raw: unknown): IntroducedBillListItem | null {
  const bill = asRecord(raw);
  if (!bill) return null;

  const congress = asPositiveInt(bill.congress);
  const typeRaw = asString(bill.type);
  const number = asPositiveInt(bill.number);
  if (congress == null || !typeRaw || number == null) return null;

  const latestAction = asRecord(bill.latestAction);
  return {
    congress,
    type: normalizeBillType(typeRaw),
    number,
    title: asString(bill.title),
    introducedDate: isoDate(bill.introducedDate),
    latestActionDate: isoDate(latestAction?.actionDate),
    latestActionText: asString(latestAction?.text),
  };
}

export function parseIntroducedBillsPage(data: unknown): {
  bills: IntroducedBillListItem[];
  nextUrl: string | null;
} {
  const root = asRecord(data);
  const rawBills = root?.bills;
  const bills: IntroducedBillListItem[] = [];
  if (Array.isArray(rawBills)) {
    for (const entry of rawBills) {
      const parsed = parseIntroducedBillListItem(entry);
      if (parsed) bills.push(parsed);
    }
  }
  const pagination = asRecord(root?.pagination);
  const next = asString(pagination?.next);
  return { bills, nextUrl: next };
}

export function isIntroLookbackCandidate(
  item: IntroducedBillListItem,
  lookbackDate: string
): boolean {
  if (item.introducedDate) return item.introducedDate >= lookbackDate;
  const actionDate = item.latestActionDate;
  if (!actionDate || actionDate < lookbackDate) return false;
  return (
    looksLikeIntroductionAction(item.latestActionText) ||
    looksLikeSameDayReferralAction(item.latestActionText)
  );
}

function billKey(congress: number, type: string, number: number): string {
  return `${congress}:${normalizeBillType(type)}:${number}`;
}

function sortIntros(a: RecentIntroducedBill, b: RecentIntroducedBill): number {
  const byDate = b.introducedDate.localeCompare(a.introducedDate);
  if (byDate !== 0) return byDate;
  return b.number - a.number;
}

function introListUrl(
  congress: number,
  billType: string,
  lookbackDate: string,
  apiKey: string,
  pageSize: number
): string {
  const limit = Math.max(1, Math.min(250, Math.floor(pageSize)));
  const from = `${lookbackDate}T00:00:00Z`;
  const sort = encodeURIComponent("updateDate+desc");
  return (
    `https://api.congress.gov/v3/bill/${congress}/${billType}` +
    `?format=json&limit=${limit}&fromDateTime=${encodeURIComponent(from)}` +
    `&sort=${sort}&api_key=${apiKey}`
  );
}

async function fetchBillIntroducedDate(
  env: Env,
  bill: { congress: number; type: string; number: number }
): Promise<{ introducedDate: string | null; title: string | null }> {
  const apiKey = env.CONGRESS_API_KEY;
  const seg = bill.type.toLowerCase();
  const data = await fetchJson<{ bill?: { introducedDate?: string; title?: string } }>(
    `https://api.congress.gov/v3/bill/${bill.congress}/${seg}/${bill.number}` +
      `?format=json&api_key=${apiKey}`
  );
  return {
    introducedDate: isoDate(data.bill?.introducedDate),
    title: data.bill?.title?.trim() || null,
  };
}

/**
 * Recently introduced H.R. / S. bills from Congress.gov.
 *
 * The list endpoint filters by `updateDate` (`fromDateTime`) and sorts by
 * `updateDate` only — it does not accept `introducedDate` sort/filter. We
 * keep rows whose `introducedDate` (list or detail) falls in the lookback,
 * then cap by newest introduction.
 */
export async function fetchRecentIntroducedBills(
  env: Env,
  congress: number,
  options: {
    lookbackDate?: string;
    maxNew?: number;
    pageSize?: number;
    maxPagesPerType?: number;
    detailFetches?: number;
    now?: Date;
  } = {}
): Promise<RecentIntroducedBill[]> {
  const apiKey = env.CONGRESS_API_KEY;
  const lookbackDate =
    options.lookbackDate ?? inclusiveLookbackStartIso(INTRO_LOOKBACK_DAYS, options.now);
  const maxNew = options.maxNew ?? INTRO_FEED_MAX_NEW;
  const pageSize = options.pageSize ?? INTRO_DISCOVERY_PAGE_SIZE;
  const maxPages = options.maxPagesPerType ?? INTRO_DISCOVERY_MAX_PAGES_PER_TYPE;
  const detailBudget = options.detailFetches ?? INTRO_DETAIL_FETCHES_PER_RUN;

  const byKey = new Map<string, IntroducedBillListItem>();

  for (const billType of INTRO_DISCOVERY_BILL_TYPES) {
    let url: string | null = introListUrl(congress, billType, lookbackDate, apiKey, pageSize);
    let pages = 0;
    while (url && pages < maxPages) {
      pages += 1;
      const { data } = await fetchJsonWithMeta<unknown>(url);
      const page = parseIntroducedBillsPage(data);
      for (const item of page.bills) {
        if (item.congress !== congress) continue;
        if (!isIntroLookbackCandidate(item, lookbackDate)) continue;
        byKey.set(billKey(item.congress, item.type, item.number), item);
      }
      url = page.nextUrl ? nextPageUrl(page.nextUrl, apiKey) : null;
    }
  }

  const dated: RecentIntroducedBill[] = [];
  const needsDetail: IntroducedBillListItem[] = [];
  for (const item of byKey.values()) {
    if (item.introducedDate && item.introducedDate >= lookbackDate) {
      dated.push({ ...item, introducedDate: item.introducedDate });
    } else {
      needsDetail.push(item);
    }
  }

  dated.sort(sortIntros);
  const oldestKept = dated[maxNew - 1]?.introducedDate ?? "";
  const introPhrase = needsDetail.filter((item) =>
    looksLikeIntroductionAction(item.latestActionText)
  );
  const referralOnly = needsDetail.filter(
    (item) => !looksLikeIntroductionAction(item.latestActionText)
  );
  const byActionDateDesc = (a: IntroducedBillListItem, b: IntroducedBillListItem) =>
    (b.latestActionDate ?? "").localeCompare(a.latestActionDate ?? "");
  introPhrase.sort(byActionDateDesc);
  referralOnly.sort(byActionDateDesc);
  const ranked = [...introPhrase, ...referralOnly].filter((item) => {
    if (dated.length < maxNew) return true;
    return (item.latestActionDate ?? "") >= oldestKept;
  });
  const toFetch = ranked.slice(0, detailBudget);

  for (const item of toFetch) {
    const detail = await fetchBillIntroducedDate(env, {
      congress: item.congress,
      type: item.type,
      number: item.number,
    });
    if (!detail.introducedDate || detail.introducedDate < lookbackDate) continue;
    dated.push({
      ...item,
      title: detail.title ?? item.title,
      introducedDate: detail.introducedDate,
    });
  }

  dated.sort(sortIntros);
  return dated.slice(0, maxNew);
}
