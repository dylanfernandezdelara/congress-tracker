/**
 * Shared Congress.gov parsing helpers and internal types.
 */

import { compareDates } from "../date-parse";
import type { BillRef } from "../types";

export interface CongressPagination {
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

export interface CongressLegislationAction {
  actionDate?: string;
  text?: string;
}

export interface CongressBill {
  congress?: number;
  type?: string;
  number?: string;
  title?: string;
  url?: string;
}

export interface CongressLegislationItem {
  latestAction?: CongressLegislationAction;
  title?: string;
  congress?: number;
  type?: string;
  number?: string;
  url?: string;
  bill?: CongressBill;
}

export interface CongressLegislationResponse {
  sponsoredLegislation?: CongressLegislationItem[];
  cosponsoredLegislation?: CongressLegislationItem[];
  bills?: CongressLegislationItem[];
  results?: CongressLegislationItem[];
  pagination?: CongressPagination;
}

export function normalizeDate(dateStr: string | undefined | null): string | null {
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

export function getString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

export function extractLatestAction(data: Record<string, unknown> | null): {
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

export function extractPolicyArea(data: Record<string, unknown> | null): string | undefined {
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

export function extractSubjects(data: Record<string, unknown> | null): string[] {
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

export function extractCommittees(data: Record<string, unknown> | null): BillRef["committees"] {
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

export function extractSummary(
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

export function extractTitles(data: Record<string, unknown> | null): string[] {
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

export function extractLawInfo(
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

export function isDateInRange(date: string, start: string, end: string): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}

export function getLegislationArray(data: CongressLegislationResponse): CongressLegislationItem[] {
  return (
    data.sponsoredLegislation ??
    data.cosponsoredLegislation ??
    data.bills ??
    data.results ??
    []
  );
}

export function buildBillRef(item: CongressLegislationItem, congressFallback: number): BillRef {
  const bill = item.bill ?? item;
  return {
    congress: bill.congress ?? item.congress ?? congressFallback,
    type: String(bill.type ?? item.type ?? "S"),
    number: String(bill.number ?? item.number ?? ""),
    title: bill.title ?? item.title,
    url: bill.url ?? item.url,
  };
}
