/**
 * Congress.gov API utilities.
 */

import { fetchJsonWithRetry, type FetchConfig } from "./fetch";
import { compareDates } from "./date-parse";
import { mapWithConcurrency } from "./concurrency";
import type {
  BillRef,
  LegislationActionItem,
  MemberIndexEntry,
} from "./types";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

interface CongressPagination {
  count?: number;
  offset?: number;
  limit?: number;
  next?: string;
}

interface CongressMember {
  bioguideId?: string;
  name?: string;
  partyName?: string;
  state?: string;
  url?: string;
  terms?: {
    item?: Array<{
      chamber?: string;
      startYear?: number;
    }>;
  };
}

interface CongressMemberListResponse {
  members?: CongressMember[];
  pagination?: CongressPagination;
}

interface CongressLegislationAction {
  actionDate?: string;
  text?: string;
}

interface CongressBill {
  congress?: number;
  type?: string;
  number?: string;
  title?: string;
  url?: string;
}

interface CongressLegislationItem {
  latestAction?: CongressLegislationAction;
  title?: string;
  congress?: number;
  type?: string;
  number?: string;
  url?: string;
  bill?: CongressBill;
}

interface CongressLegislationResponse {
  sponsoredLegislation?: CongressLegislationItem[];
  cosponsoredLegislation?: CongressLegislationItem[];
  bills?: CongressLegislationItem[];
  results?: CongressLegislationItem[];
  pagination?: CongressPagination;
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

function normalizeDate(dateStr: string | undefined | null): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  if (trimmed.length >= 10) {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
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

export function buildBillKey(ref: BillRef): string {
  const type = normalizeBillType(ref.type);
  const number = normalizeBillNumber(ref.number);
  return `${ref.congress}-${type}-${number}`;
}

function getString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function extractLatestAction(data: Record<string, unknown> | null): {
  action_date?: string;
  text?: string;
} | undefined {
  if (!data) return undefined;
  const raw =
    (data as Record<string, unknown>).latestAction ??
    (data as Record<string, unknown>).latest_action ??
    (data as Record<string, unknown>).latestActionText ??
    (data as Record<string, unknown>).latest_action_text;
  if (!raw || typeof raw !== "object") return undefined;
  const action = raw as Record<string, unknown>;
  const actionDate = normalizeDate(
    getString(action.actionDate ?? action.action_date)
  );
  const text = getString(action.text ?? action.actionText ?? action.description);
  if (!actionDate && !text) return undefined;
  return {
    action_date: actionDate ?? undefined,
    text,
  };
}

function extractPolicyArea(data: Record<string, unknown> | null): string | undefined {
  if (!data) return undefined;
  const candidate =
    (data as Record<string, unknown>).policyArea ??
    (data as Record<string, unknown>).policy_area ??
    (data as Record<string, unknown>).policy_area_name;
  if (typeof candidate === "string") return candidate.trim() || undefined;
  if (candidate && typeof candidate === "object") {
    return getString((candidate as Record<string, unknown>).name);
  }
  return undefined;
}

function extractSubjects(data: Record<string, unknown> | null): string[] {
  if (!data) return [];
  const candidates = [
    (data as Record<string, unknown>).subjects,
    (data as Record<string, unknown>).legislativeSubjects,
    (data as Record<string, unknown>).legislative_subjects,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) =>
          getString((item as Record<string, unknown>).name ?? item)
        )
        .filter((value): value is string => Boolean(value));
    }
    if (candidate && typeof candidate === "object") {
      const maybeList =
        (candidate as Record<string, unknown>).legislativeSubjects ??
        (candidate as Record<string, unknown>).subjects ??
        (candidate as Record<string, unknown>).items ??
        (candidate as Record<string, unknown>).results;
      if (Array.isArray(maybeList)) {
        return maybeList
          .map((item) =>
            getString((item as Record<string, unknown>).name ?? item)
          )
          .filter((value): value is string => Boolean(value));
      }
    }
  }
  return [];
}

function extractCommittees(data: Record<string, unknown> | null): BillRef["committees"] {
  if (!data) return undefined;
  const candidates = [
    (data as Record<string, unknown>).committees,
    (data as Record<string, unknown>).committee,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const committees = candidate
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          const name = getString(record.name ?? record.committeeName);
          if (!name) return null;
          return {
            name,
            chamber: getString(record.chamber),
            committee_id: getString(record.committeeId ?? record.committee_id),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      return committees.length ? committees : undefined;
    }
    if (candidate && typeof candidate === "object") {
      const nested =
        (candidate as Record<string, unknown>).items ??
        (candidate as Record<string, unknown>).results ??
        (candidate as Record<string, unknown>).committees;
      if (Array.isArray(nested)) {
        const committees = nested
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            const name = getString(record.name ?? record.committeeName);
            if (!name) return null;
            return {
              name,
              chamber: getString(record.chamber),
              committee_id: getString(record.committeeId ?? record.committee_id),
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item));
        return committees.length ? committees : undefined;
      }
    }
  }
  return undefined;
}

function extractSummary(
  data: Record<string, unknown> | null
): { summary?: string; summary_date?: string } {
  if (!data) return {};
  const container =
    (data as Record<string, unknown>).summaries ??
    (data as Record<string, unknown>).summary ??
    (data as Record<string, unknown>).billSummaries ??
    data;

  const list = Array.isArray(container)
    ? container
    : (container as Record<string, unknown>)?.summaries ??
      (container as Record<string, unknown>)?.items ??
      (container as Record<string, unknown>)?.results ??
      [];

  if (!Array.isArray(list)) return {};

  const normalized: Array<{ text: string; date?: string }> = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const text =
      getString(record.text ?? record.summary ?? record.summaryText ?? record.summary_text) ??
      getString(record.description);
    const updateDate = normalizeDate(getString(record.updateDate ?? record.update_date));
    const actionDate = normalizeDate(getString(record.actionDate ?? record.action_date));
    if (!text) continue;
    normalized.push({
      text,
      date: updateDate ?? actionDate ?? undefined,
    });
  }

  if (normalized.length === 0) return {};
  normalized.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return {
    summary: normalized[0].text,
    summary_date: normalized[0].date,
  };
}

function extractTitles(data: Record<string, unknown> | null): string[] {
  if (!data) return [];
  const container =
    (data as Record<string, unknown>).titles ??
    (data as Record<string, unknown>).title ??
    data;
  const list = Array.isArray(container)
    ? container
    : (container as Record<string, unknown>)?.titles ??
      (container as Record<string, unknown>)?.items ??
      (container as Record<string, unknown>)?.results ??
      [];
  if (!Array.isArray(list)) return [];
  const titles = list
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      return getString(
        record.title ??
          record.titleText ??
          record.name ??
          record.displayText
      );
    })
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(titles)).slice(0, 8);
}

function extractLawInfo(
  data: Record<string, unknown> | null
): BillRef["law"] | undefined {
  if (!data) return undefined;
  const lawCandidate =
    (data as Record<string, unknown>).law ??
    (data as Record<string, unknown>).laws ??
    (data as Record<string, unknown>).latestLaw;

  const list = Array.isArray(lawCandidate)
    ? lawCandidate
    : lawCandidate && typeof lawCandidate === "object"
      ? [
          (lawCandidate as Record<string, unknown>).law ??
            (lawCandidate as Record<string, unknown>).latestLaw ??
            lawCandidate,
        ]
      : [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const number = getString(
      record.number ??
        record.lawNumber ??
        record.law_number ??
        record.publicLawNumber
    );
    const type = getString(record.type ?? record.lawType ?? record.law_type);
    const lawId = getString(record.lawId ?? record.law_id ?? record.identifier);
    const url = getString(record.url);
    const congressValue = Number(
      getString(record.congress ?? record.congressNumber) ?? ""
    );
    const congress =
      Number.isFinite(congressValue) && congressValue > 0
        ? congressValue
        : undefined;
    if (!number && !lawId && !url) continue;
    return { number: number ?? undefined, type, law_id: lawId, congress, url };
  }
  return undefined;
}

function isDateInRange(date: string, start: string, end: string): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}

function getLegislationArray(data: CongressLegislationResponse): CongressLegislationItem[] {
  return (
    data.sponsoredLegislation ??
    data.cosponsoredLegislation ??
    data.bills ??
    data.results ??
    []
  );
}

function buildBillRef(item: CongressLegislationItem, congressFallback: number): BillRef {
  const bill = item.bill ?? item;
  return {
    congress: bill.congress ?? item.congress ?? congressFallback,
    type: String(bill.type ?? item.type ?? "S"),
    number: String(bill.number ?? item.number ?? ""),
    title: bill.title ?? item.title,
    url: bill.url ?? item.url,
  };
}

function toMemberIndexEntry(member: CongressMember): MemberIndexEntry | null {
  const bioguideId = member.bioguideId?.trim();
  if (!bioguideId) return null;
  return {
    bioguide_id: bioguideId,
    name: member.name?.trim() || bioguideId,
    party: normalizeParty(member.partyName),
    state: normalizeStateName(member.state),
    chamber: "Senate",
    url: member.url,
  };
}

function normalizeParty(partyName?: string): string {
  const value = (partyName ?? "").toLowerCase();
  if (!value) return "";
  if (value.includes("democrat")) return "D";
  if (value.includes("republican")) return "R";
  if (value.includes("independent")) return "I";
  return partyName?.trim().charAt(0).toUpperCase() ?? "";
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function normalizeStateName(state?: string): string {
  const trimmed = state?.trim();
  if (!trimmed) return "";
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const lookup = STATE_ABBREVIATIONS[trimmed.toLowerCase()];
  return lookup ?? trimmed.toUpperCase();
}

function isSenateMember(member: CongressMember): boolean {
  const terms = member.terms?.item ?? [];
  return terms.some((term) => (term.chamber ?? "").toLowerCase() === "senate");
}

async function fetchMemberLegislationPage(
  bioguideId: string,
  item: string,
  apiKey: string,
  params: Record<string, string | number | boolean>,
  config: FetchConfig
): Promise<{ data: CongressLegislationResponse | null; error?: string }> {
  const primaryUrl = buildCongressUrl(`/member/${bioguideId}`, { item, ...params }, apiKey);
  const primary = await fetchJsonWithRetry<CongressLegislationResponse>(primaryUrl, config);
  if (primary.success && primary.data) {
    return { data: primary.data };
  }

  // Fallback to path-based endpoint if item query param is not supported.
  const fallbackUrl = buildCongressUrl(`/member/${bioguideId}/${item}`, params, apiKey);
  const fallback = await fetchJsonWithRetry<CongressLegislationResponse>(fallbackUrl, config);
  if (fallback.success && fallback.data) {
    return { data: fallback.data };
  }

  return { data: null, error: fallback.error ?? primary.error ?? "Unknown error" };
}

export async function fetchCurrentSenators(
  congress: number,
  apiKey: string,
  config: FetchConfig = {}
): Promise<MemberIndexEntry[]> {
  const members: MemberIndexEntry[] = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const url = buildCongressUrl(
      `/member/congress/${congress}`,
      {
        currentMember: true,
        limit,
        offset,
      },
      apiKey
    );
    const result = await fetchJsonWithRetry<CongressMemberListResponse>(url, config);
    if (!result.success || !result.data) {
      break;
    }
    const batch = (result.data.members ?? [])
      .filter(isSenateMember)
      .map(toMemberIndexEntry)
      .filter((m): m is MemberIndexEntry => m !== null);
    members.push(...batch);

    const pagination = result.data.pagination;
    if (pagination?.next) {
      offset += limit;
      continue;
    }
    if (pagination?.count !== undefined && pagination?.offset !== undefined) {
      if (pagination.offset + limit < pagination.count) {
        offset += limit;
        continue;
      }
    }
    if (batch.length < limit) {
      break;
    }
    offset += limit;
  }

  members.sort((a, b) => a.name.localeCompare(b.name));
  return members;
}

export async function fetchMemberLegislationActions(
  bioguideId: string,
  congress: number,
  role: "sponsor" | "cosponsor",
  windowStart: string,
  windowEnd: string,
  apiKey: string,
  config: FetchConfig = {}
): Promise<{ actions: LegislationActionItem[]; error?: string }> {
  const item = role === "sponsor" ? "sponsored-legislation" : "cosponsored-legislation";
  const limit = 250;
  let offset = 0;
  const actions: LegislationActionItem[] = [];
  let fallbackAction: LegislationActionItem | null = null;
  let errorMessage: string | undefined;

  while (true) {
    const { data, error } = await fetchMemberLegislationPage(
      bioguideId,
      item,
      apiKey,
      { limit, offset },
      config
    );
    if (!data) {
      if (error && !errorMessage) {
        errorMessage = error;
      }
      break;
    }

    const items = getLegislationArray(data);
    for (const entry of items) {
      const actionDate = normalizeDate(entry.latestAction?.actionDate);
      if (!actionDate) {
        continue;
      }

      const actionText = entry.latestAction?.text?.trim() || "Latest action";
      const candidate: LegislationActionItem = {
        source: "congress",
        type: "legislation_action",
        role,
        action_date: actionDate,
        action_text: actionText,
        bill: buildBillRef(entry, congress),
        is_recent: false,
      };

      if (isDateInRange(actionDate, windowStart, windowEnd)) {
        actions.push({ ...candidate, is_recent: true });
        continue;
      }

      if (
        !fallbackAction ||
        compareDates(actionDate, fallbackAction.action_date) > 0
      ) {
        fallbackAction = candidate;
      }
    }

    const pagination = data.pagination;
    if (pagination?.next) {
      offset += limit;
      continue;
    }
    if (pagination?.count !== undefined && pagination?.offset !== undefined) {
      if (pagination.offset + limit < pagination.count) {
        offset += limit;
        continue;
      }
    }
    if (items.length < limit) {
      break;
    }
    offset += limit;
  }

  if (errorMessage) {
    console.warn(`[congress] ${bioguideId} ${item} fetch failed: ${errorMessage}`);
  }
  if (actions.length === 0 && fallbackAction) {
    actions.push(fallbackAction);
  }
  return { actions, error: errorMessage };
}

async function fetchFirstEndpoint(
  urls: string[],
  config: FetchConfig
): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  let lastError: string | undefined;
  for (const url of urls) {
    const result = await fetchJsonWithRetry<Record<string, unknown>>(url, config);
    if (result.success && result.data) {
      return { data: result.data };
    }
    lastError = result.error ?? `Failed fetch for ${url}`;
  }
  return { data: null, error: lastError };
}

export async function fetchBillDetails(
  ref: BillRef,
  apiKey: string,
  config: FetchConfig = {}
): Promise<{ bill: BillRef; error?: string }> {
  const billType = normalizeBillType(ref.type);
  const billNumber = normalizeBillNumber(ref.number);
  if (!billType || !billNumber) {
    return { bill: ref, error: "Missing bill type or number" };
  }

  const basePath = `/bill/${ref.congress}/${billType}/${billNumber}`;
  const detailUrl = buildCongressUrl(basePath, {}, apiKey);
  const summaryUrl = buildCongressUrl(`${basePath}/summaries`, {}, apiKey);
  const subjectsUrl = buildCongressUrl(`${basePath}/subjects`, {}, apiKey);
  const committeesUrl = buildCongressUrl(`${basePath}/committees`, {}, apiKey);
  const titlesUrls = [
    buildCongressUrl(`${basePath}/titles`, {}, apiKey),
    buildCongressUrl(`${basePath}/title`, {}, apiKey),
  ];
  const lawUrls = [
    buildCongressUrl(`${basePath}/law`, {}, apiKey),
    buildCongressUrl(`${basePath}/laws`, {}, apiKey),
  ];

  const [detailResult, summaryResult, subjectsResult, committeesResult, titlesResult, lawResult] =
    await Promise.all([
      fetchJsonWithRetry<Record<string, unknown>>(detailUrl, config),
      fetchJsonWithRetry<Record<string, unknown>>(summaryUrl, config),
      fetchJsonWithRetry<Record<string, unknown>>(subjectsUrl, config),
      fetchJsonWithRetry<Record<string, unknown>>(committeesUrl, config),
      fetchFirstEndpoint(titlesUrls, config),
      fetchFirstEndpoint(lawUrls, config),
    ]);

  const detailData =
    detailResult.data && typeof detailResult.data === "object"
      ? (detailResult.data.bill as Record<string, unknown>) ?? detailResult.data
      : null;

  const title =
    getString(
      detailData?.title ??
        detailData?.shortTitle ??
        detailData?.officialTitle ??
        detailData?.short_title ??
        detailData?.official_title
    ) ?? ref.title;

  const url =
    getString(
      detailData?.url ??
        detailData?.billUrl ??
        detailData?.bill_url ??
        detailData?.congressdotgovUrl ??
        detailData?.congressdotgov_url
    ) ?? ref.url;

  const introducedDate = normalizeDate(
    getString(detailData?.introducedDate ?? detailData?.introduced_date)
  );

  const latestAction = extractLatestAction(detailData ?? null);
  const policyArea =
    extractPolicyArea(detailData ?? null) ??
    extractPolicyArea(subjectsResult.data ?? null);
  const subjectsFromEndpoint = extractSubjects(subjectsResult.data ?? null);
  const subjects =
    subjectsFromEndpoint.length > 0
      ? subjectsFromEndpoint
      : extractSubjects(detailData ?? null);
  const titles = extractTitles(titlesResult.data ?? detailData ?? null);
  const committees =
    extractCommittees(committeesResult.data ?? null) ??
    extractCommittees(detailData ?? null);
  const law =
    extractLawInfo(lawResult.data ?? null) ??
    extractLawInfo(detailData ?? null);
  const summaryPayload = extractSummary(summaryResult.data ?? null);

  const bill: BillRef = {
    ...ref,
    title,
    titles: titles.length > 0 ? titles : ref.titles,
    url,
    introduced_date: introducedDate ?? ref.introduced_date,
    latest_action: latestAction ?? ref.latest_action,
    law: law ?? ref.law,
    policy_area: policyArea ?? ref.policy_area,
    subjects: subjects.length ? subjects : ref.subjects,
    committees: committees ?? ref.committees,
    summary: summaryPayload.summary ?? ref.summary,
    summary_date: summaryPayload.summary_date ?? ref.summary_date,
  };

  const error =
    detailResult.error ??
    summaryResult.error ??
    subjectsResult.error ??
    committeesResult.error ??
    titlesResult.error ??
    lawResult.error;
  return { bill, error };
}

export async function fetchBillDetailsMap(
  bills: BillRef[],
  apiKey: string,
  config: FetchConfig = {}
): Promise<Map<string, BillRef>> {
  const unique = new Map<string, BillRef>();
  for (const bill of bills) {
    if (!bill?.congress || !bill.type || !bill.number) continue;
    const key = buildBillKey(bill);
    if (!unique.has(key)) {
      unique.set(key, bill);
    }
  }

  const entries = Array.from(unique.entries());
  const concurrency = Math.min(config.concurrency ?? 4, 4);

  const results = await mapWithConcurrency(entries, concurrency, async ([key, bill]) => {
    const { bill: enriched } = await fetchBillDetails(bill, apiKey, config);
    return { key, bill: enriched };
  });

  const output = new Map<string, BillRef>();
  for (const item of results) {
    output.set(item.key, item.bill);
  }
  return output;
}

interface CongressCommitteeMeetingListItem {
  eventId?: string | number;
  congress?: number;
  chamber?: string;
  updateDate?: string;
  url?: string;
}

interface CongressCommitteeMeetingListResponse {
  committeeMeetings?: CongressCommitteeMeetingListItem[];
  pagination?: CongressPagination;
}

interface SenateCommitteeMeetingAdapterOptions {
  fromDateTime?: string;
  toDateTime?: string;
  maxMeetings?: number;
}

export interface CongressMeetingDocument {
  document_type: string;
  description?: string;
  name?: string;
  url?: string;
  format?: string;
}

export interface SenateCommitteeMeetingAdapterItem {
  source: "congress";
  event_id: string;
  congress: number;
  chamber: "Senate";
  date: string; // YYYY-MM-DD
  time?: string;
  title: string;
  meeting_status?: string;
  meeting_type?: string;
  committees: Array<{
    name: string;
    system_code?: string;
    url?: string;
  }>;
  location?: string;
  url?: string;
  related_bills: BillRef[];
  related_nominations?: string[];
  related_treaties?: string[];
  nomination_signals: string[];
  meeting_documents: CongressMeetingDocument[];
}

interface CongressDailyRecordIssue {
  volumeNumber?: number;
  issueNumber?: string | number;
  issueDate?: string;
}

interface CongressDailyRecordListResponse {
  dailyCongressionalRecord?: CongressDailyRecordIssue[];
  pagination?: CongressPagination;
}

interface CongressDailyRecordSectionArticle {
  title?: string;
  startPage?: string;
  endPage?: string;
  text?: Array<{ type?: string; url?: string }>;
}

interface CongressDailyRecordSection {
  name?: string;
  sectionArticles?: CongressDailyRecordSectionArticle[];
}

interface CongressDailyRecordArticlesResponse {
  articles?: CongressDailyRecordSection[];
}

interface SenateDailyRecordAdapterOptions {
  issueLimit?: number;
  maxArticles?: number;
}

export interface SenateDailyRecordArticleItem {
  source: "congress";
  issue_date: string;
  volume_number: number;
  issue_number: string;
  section_name: string;
  title: string;
  start_page?: string;
  end_page?: string;
  formatted_text_url?: string;
  pdf_url?: string;
}

function normalizeIsoDateTime(
  value: string | undefined
): { date: string; time?: string } | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const iso = parsed.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
  };
}

function normalizeBillTypeFromLabel(value: string): string {
  const cleaned = value
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\./g, "");
  if (cleaned === "HR") return "HR";
  if (cleaned === "S") return "S";
  if (cleaned === "HJRES") return "HJRES";
  if (cleaned === "SJRES") return "SJRES";
  if (cleaned === "HCONRES") return "HCONRES";
  if (cleaned === "SCONRES") return "SCONRES";
  if (cleaned === "HRES") return "HRES";
  if (cleaned === "SRES") return "SRES";
  return cleaned;
}

function collectRelatedLabels(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const labels: string[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const label = getString(
      record.title ??
        record.name ??
        record.nominationNumber ??
        record.treatyNumber ??
        record.number ??
        record.identifier
    );
    if (label) labels.push(label);
  }
  return labels;
}

function parseBillRefFromStructuredItem(
  item: unknown,
  congress: number
): BillRef | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const typeRaw = getString(record.type ?? record.billType ?? record.bill_type);
  const numberRaw = getString(record.number ?? record.billNumber ?? record.bill_number);
  const congressRaw = Number(getString(record.congress ?? record.congressNumber) ?? "");
  const resolvedCongress =
    Number.isFinite(congressRaw) && congressRaw > 0 ? congressRaw : congress;

  if (typeRaw && numberRaw) {
    return {
      congress: resolvedCongress,
      type: normalizeBillTypeFromLabel(typeRaw),
      number: numberRaw,
      title: getString(record.title ?? record.name),
      url: getString(record.url),
    };
  }

  const fallbackText = getString(record.title ?? record.name ?? record.identifier);
  if (!fallbackText) return null;
  const fromText = extractBillRefsFromMeetingText(fallbackText, resolvedCongress)[0];
  if (!fromText) return null;
  return {
    ...fromText,
    title: getString(record.title ?? record.name) ?? fromText.title,
    url: getString(record.url) ?? fromText.url,
  };
}

function extractStructuredRelatedItems(
  rawMeeting: Record<string, unknown>,
  congress: number
): {
  relatedBills: BillRef[];
  relatedNominations: string[];
  relatedTreaties: string[];
} {
  const related = rawMeeting.relatedItems;
  if (!related || typeof related !== "object") {
    return { relatedBills: [], relatedNominations: [], relatedTreaties: [] };
  }
  const relatedRecord = related as Record<string, unknown>;

  const billCandidates =
    relatedRecord.bills ??
    relatedRecord.bill ??
    relatedRecord.relatedBills ??
    relatedRecord.related_bills ??
    [];
  const nominationCandidates =
    relatedRecord.nominations ??
    relatedRecord.nomination ??
    relatedRecord.relatedNominations ??
    [];
  const treatyCandidates =
    relatedRecord.treaties ??
    relatedRecord.treaty ??
    relatedRecord.relatedTreaties ??
    [];

  const billItems = Array.isArray(billCandidates) ? billCandidates : [];
  const relatedBills = billItems
    .map((item) => parseBillRefFromStructuredItem(item, congress))
    .filter((item): item is BillRef => Boolean(item));

  const relatedNominations = collectRelatedLabels(nominationCandidates);
  const relatedTreaties = collectRelatedLabels(treatyCandidates);

  return {
    relatedBills: relatedBills.slice(0, 12),
    relatedNominations: Array.from(new Set(relatedNominations)).slice(0, 6),
    relatedTreaties: Array.from(new Set(relatedTreaties)).slice(0, 6),
  };
}

function extractBillRefsFromMeetingText(
  text: string,
  congress: number
): BillRef[] {
  const normalizedText = text.replace(/&#38;|&amp;/gi, "&");
  const regex =
    /\b(S\.?\s*J\.?\s*RES\.?|S\.?\s*CON\.?\s*RES\.?|S\.?\s*RES\.?|S\.?|H\.?\s*J\.?\s*RES\.?|H\.?\s*CON\.?\s*RES\.?|H\.?\s*RES\.?|H\.?\s*R\.?)\s*\.?\s*(\d+)\b/gi;
  const refs: BillRef[] = [];
  const seen = new Set<string>();
  let match = regex.exec(normalizedText);
  while (match) {
    const type = normalizeBillTypeFromLabel(match[1]);
    const number = match[2];
    const key = `${congress}-${type}-${number}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({
        congress,
        type,
        number,
      });
    }
    match = regex.exec(normalizedText);
  }
  return refs;
}

function extractNominationSignalsFromText(text: string): string[] {
  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/&#38;|&amp;/gi, "&")
    .trim();
  if (!normalized) return [];
  const signalRegex = /\b(nomination|nominations|nominee|nominees|to be an? )\b/i;
  if (!signalRegex.test(normalized)) return [];
  const snippets = normalized
    .split(/[.;]/)
    .map((segment) => segment.trim())
    .filter((segment) => signalRegex.test(segment))
    .slice(0, 3);
  return snippets.length > 0 ? snippets : [normalized.slice(0, 160)];
}

export async function fetchSenateCommitteeMeetings(
  congress: number,
  apiKey: string,
  config: FetchConfig = {},
  options: SenateCommitteeMeetingAdapterOptions = {}
): Promise<{ meetings: SenateCommitteeMeetingAdapterItem[]; error?: string }> {
  const limit = Math.min(250, Math.max(10, options.maxMeetings ?? 120));
  const listParams: Record<string, string | number | boolean> = {
    limit,
    offset: 0,
  };
  if (options.fromDateTime) {
    listParams.fromDateTime = options.fromDateTime;
  }
  if (options.toDateTime) {
    listParams.toDateTime = options.toDateTime;
  }

  const listUrl = buildCongressUrl(
    `/committee-meeting/${congress}/senate`,
    listParams,
    apiKey
  );
  const listResult = await fetchJsonWithRetry<CongressCommitteeMeetingListResponse>(
    listUrl,
    config
  );
  if (!listResult.success || !listResult.data) {
    return {
      meetings: [],
      error: listResult.error ?? "Congress committee meeting list fetch failed",
    };
  }

  const meetings = listResult.data.committeeMeetings ?? [];
  const selectedMeetings = meetings.slice(0, limit);
  const detailResults = await mapWithConcurrency(
    selectedMeetings,
    Math.max(1, Math.min(config.concurrency ?? 4, 6)),
    async (entry) => {
      const eventId = getString(entry.eventId);
      if (!eventId) return null;
      const detailUrl = buildCongressUrl(
        `/committee-meeting/${congress}/senate/${eventId}`,
        {},
        apiKey
      );
      const detailResult = await fetchJsonWithRetry<Record<string, unknown>>(
        detailUrl,
        config
      );
      if (!detailResult.success || !detailResult.data) {
        return null;
      }
      const rawMeeting = detailResult.data.committeeMeeting as
        | Record<string, unknown>
        | undefined;
      if (!rawMeeting || typeof rawMeeting !== "object") {
        return null;
      }

      const datetime = normalizeIsoDateTime(getString(rawMeeting.date)) ??
        normalizeIsoDateTime(getString(rawMeeting.updateDate));
      const fallbackDate = normalizeDate(getString(entry.updateDate)) ?? "";
      const date = datetime?.date ?? fallbackDate;
      if (!date) return null;

      const committeesRaw = Array.isArray(rawMeeting.committees)
        ? (rawMeeting.committees as Array<Record<string, unknown>>)
        : [];
      const committees: Array<{ name: string; system_code?: string; url?: string }> = [];
      for (const committee of committeesRaw) {
        const name = getString(committee.name);
        if (!name) continue;
        committees.push({
          name,
          system_code: getString(committee.systemCode),
          url: getString(committee.url),
        });
      }

      const locationObject =
        rawMeeting.location && typeof rawMeeting.location === "object"
          ? (rawMeeting.location as Record<string, unknown>)
          : null;
      const locationParts = [
        getString(locationObject?.building),
        getString(locationObject?.room),
        getString(locationObject?.address),
      ].filter((value): value is string => Boolean(value));
      const location = locationParts.length ? locationParts.join(" • ") : undefined;

      const docsRaw = Array.isArray(rawMeeting.meetingDocuments)
        ? (rawMeeting.meetingDocuments as Array<Record<string, unknown>>)
        : [];
      const meetingDocuments = docsRaw.map((doc) => ({
        document_type:
          getString(doc.documentType) ??
          getString(doc.type) ??
          "Document",
        description: getString(doc.description),
        name: getString(doc.name),
        url: getString(doc.url),
        format: getString(doc.format),
      }));

      const sourceTexts = [
        getString(rawMeeting.title),
        ...meetingDocuments.map((doc) => doc.description ?? doc.name ?? ""),
      ]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.trim());

      const structuredRelated = extractStructuredRelatedItems(rawMeeting, congress);
      const relatedBillMap = new Map<string, BillRef>();
      for (const bill of structuredRelated.relatedBills) {
        relatedBillMap.set(buildBillKey(bill), bill);
      }
      for (const text of sourceTexts) {
        for (const bill of extractBillRefsFromMeetingText(text, congress)) {
          relatedBillMap.set(buildBillKey(bill), bill);
        }
      }
      const relatedBills = Array.from(relatedBillMap.values());

      const nominationSignals = Array.from(
        new Set([
          ...structuredRelated.relatedNominations,
          ...sourceTexts.flatMap((text) => extractNominationSignalsFromText(text)),
        ])
      );

      const videos = Array.isArray(rawMeeting.videos)
        ? (rawMeeting.videos as Array<Record<string, unknown>>)
        : [];
      const meetingUrl =
        getString(entry.url) ?? getString(videos[0]?.url) ?? undefined;

      return {
        source: "congress",
        event_id: eventId,
        congress,
        chamber: "Senate",
        date,
        time: datetime?.time,
        title: getString(rawMeeting.title) ?? `Senate committee meeting ${eventId}`,
        meeting_status: getString(rawMeeting.meetingStatus),
        meeting_type: getString(rawMeeting.type),
        committees,
        location,
        url: meetingUrl,
        related_bills: relatedBills,
        related_nominations: structuredRelated.relatedNominations,
        related_treaties: structuredRelated.relatedTreaties,
        nomination_signals: nominationSignals.slice(0, 6),
        meeting_documents: meetingDocuments,
      } satisfies SenateCommitteeMeetingAdapterItem;
    }
  );

  const normalized: SenateCommitteeMeetingAdapterItem[] = [];
  for (const item of detailResults) {
    if (item) normalized.push(item);
  }
  normalized.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return (a.time ?? "").localeCompare(b.time ?? "");
  });
  const missingCount = selectedMeetings.length - normalized.length;
  return {
    meetings: normalized,
    error:
      missingCount > 0
        ? `Dropped ${missingCount} committee meeting detail payload(s) due to missing or invalid data`
        : undefined,
  };
}

export async function fetchDailyCongressionalRecordSenateArticles(
  apiKey: string,
  config: FetchConfig = {},
  options: SenateDailyRecordAdapterOptions = {}
): Promise<{ articles: SenateDailyRecordArticleItem[]; error?: string }> {
  const issueLimit = Math.max(1, Math.min(options.issueLimit ?? 20, 100));
  const maxArticles = Math.max(1, options.maxArticles ?? 100);
  const listUrl = buildCongressUrl(
    "/daily-congressional-record",
    {
      limit: issueLimit,
      offset: 0,
    },
    apiKey
  );
  const issueListResult = await fetchJsonWithRetry<CongressDailyRecordListResponse>(
    listUrl,
    config
  );
  if (!issueListResult.success || !issueListResult.data) {
    return {
      articles: [],
      error:
        issueListResult.error ??
        "Congress daily congressional record list lookup failed",
    };
  }

  const issues = issueListResult.data.dailyCongressionalRecord ?? [];
  const issueWorklist = issues
    .map((issue) => {
      const volumeNumber = issue.volumeNumber;
      const issueNumber = getString(issue.issueNumber);
      const issueDate = normalizeDate(issue.issueDate) ?? undefined;
      if (!volumeNumber || !issueNumber || !issueDate) return null;
      return {
        volumeNumber,
        issueNumber,
        issueDate,
      };
    })
    .filter(
      (
        issue
      ): issue is { volumeNumber: number; issueNumber: string; issueDate: string } =>
        Boolean(issue)
    );

  const articleResults = await mapWithConcurrency(
    issueWorklist,
    Math.max(1, Math.min(config.concurrency ?? 4, 4)),
    async (issue) => {
      const articlesUrl = buildCongressUrl(
        `/daily-congressional-record/${issue.volumeNumber}/${issue.issueNumber}/articles`,
        {
          limit: 250,
          offset: 0,
        },
        apiKey
      );
      const articlesResult = await fetchJsonWithRetry<CongressDailyRecordArticlesResponse>(
        articlesUrl,
        config
      );
      if (!articlesResult.success || !articlesResult.data) {
        return [] as SenateDailyRecordArticleItem[];
      }

      const sections = articlesResult.data.articles ?? [];
      const senateSections = sections.filter((section) =>
        (section.name ?? "").toLowerCase().includes("senate")
      );
      if (senateSections.length === 0) {
        return [];
      }

      const extracted: SenateDailyRecordArticleItem[] = [];
      for (const section of senateSections) {
        const sectionName = section.name?.trim() ?? "Senate";
        for (const sectionArticle of section.sectionArticles ?? []) {
          const title = sectionArticle.title?.trim();
          if (!title) continue;
          const textEntries = sectionArticle.text ?? [];
          const formattedTextUrl =
            textEntries.find((entry) =>
              (entry.type ?? "").toLowerCase().includes("formatted")
            )?.url ??
            textEntries.find((entry) =>
              (entry.type ?? "").toLowerCase().includes("text")
            )?.url;
          const pdfUrl =
            textEntries.find((entry) =>
              (entry.type ?? "").toLowerCase().includes("pdf")
            )?.url;

          extracted.push({
            source: "congress",
            issue_date: issue.issueDate,
            volume_number: issue.volumeNumber,
            issue_number: issue.issueNumber,
            section_name: sectionName,
            title,
            start_page: sectionArticle.startPage?.trim() || undefined,
            end_page: sectionArticle.endPage?.trim() || undefined,
            formatted_text_url: formattedTextUrl,
            pdf_url: pdfUrl,
          });
        }
      }
      return extracted;
    }
  );

  const flattened = articleResults.flatMap((items) => items);
  flattened.sort((a, b) => {
    const byDate = b.issue_date.localeCompare(a.issue_date);
    if (byDate !== 0) return byDate;
    const byVolume = b.volume_number - a.volume_number;
    if (byVolume !== 0) return byVolume;
    return a.title.localeCompare(b.title);
  });
  return {
    articles: flattened.slice(0, maxArticles),
  };
}
