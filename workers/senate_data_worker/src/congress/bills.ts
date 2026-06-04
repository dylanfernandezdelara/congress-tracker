/**
 * Congress.gov bill detail fetchers.
 */

import { fetchJsonWithRetry, type FetchConfig } from "../fetch";
import { mapWithConcurrency } from "../concurrency";
import {
  buildBillKey,
  buildCongressUrl,
  normalizeBillNumber,
  normalizeBillType,
} from "../sources/congress-client";
import type { BillRef, SponsorPartySignal } from "../types";
import {
  getString,
  normalizeDate,
  extractLatestAction,
  extractPolicyArea,
  extractSubjects,
  extractCommittees,
  extractSummary,
  extractTitles,
  extractLawInfo,
} from "./internal";

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

function extractSponsorPartySignals(
  detailData: Record<string, unknown> | null,
  cosponsorsData: Record<string, unknown> | null,
): SponsorPartySignal[] {
  const signals: SponsorPartySignal[] = [];
  const seen = new Set<string>();

  if (detailData) {
    const sponsors = detailData.sponsors ?? detailData.sponsor;
    const sponsorList = Array.isArray(sponsors) ? sponsors : sponsors ? [sponsors] : [];
    for (const s of sponsorList) {
      if (!s || typeof s !== "object") continue;
      const obj = s as Record<string, unknown>;
      const bioguide = getString(obj.bioguideId ?? obj.bioguide_id);
      const party = getString(obj.party);
      if (bioguide && party && !seen.has(bioguide)) {
        seen.add(bioguide);
        signals.push({ bioguide_id: bioguide, party, role: "sponsor" });
      }
    }
  }

  if (cosponsorsData) {
    const cosponsors = cosponsorsData.cosponsors ?? cosponsorsData.co_sponsors;
    if (Array.isArray(cosponsors)) {
      for (const c of cosponsors) {
        if (!c || typeof c !== "object") continue;
        const obj = c as Record<string, unknown>;
        const bioguide = getString(obj.bioguideId ?? obj.bioguide_id);
        const party = getString(obj.party);
        if (bioguide && party && !seen.has(bioguide)) {
          seen.add(bioguide);
          signals.push({ bioguide_id: bioguide, party, role: "cosponsor" });
        }
      }
    }
  }

  return signals;
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

  const cosponsorsUrl = buildCongressUrl(`${basePath}/cosponsors`, {}, apiKey);

  const [detailResult, summaryResult, subjectsResult, committeesResult, titlesResult, lawResult, cosponsorsResult] =
    await Promise.all([
      fetchJsonWithRetry<Record<string, unknown>>(detailUrl, config),
      fetchJsonWithRetry<Record<string, unknown>>(summaryUrl, config),
      fetchJsonWithRetry<Record<string, unknown>>(subjectsUrl, config),
      fetchJsonWithRetry<Record<string, unknown>>(committeesUrl, config),
      fetchFirstEndpoint(titlesUrls, config),
      fetchFirstEndpoint(lawUrls, config),
      fetchJsonWithRetry<Record<string, unknown>>(cosponsorsUrl, config),
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

  const sponsorPartySignals = extractSponsorPartySignals(
    detailData ?? null,
    cosponsorsResult.data ?? null,
  );

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
    sponsor_party_signals: sponsorPartySignals.length > 0 ? sponsorPartySignals : ref.sponsor_party_signals,
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
