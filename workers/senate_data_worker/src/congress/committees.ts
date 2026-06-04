/**
 * Congress.gov Senate committee meeting adapter.
 */

import { fetchJsonWithRetry, type FetchConfig } from "../fetch";
import { mapWithConcurrency } from "../concurrency";
import { buildBillKey, buildCongressUrl } from "../sources/congress-client";
import type { BillRef } from "../types";
import { getString, normalizeDate, type CongressPagination } from "./internal";

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
