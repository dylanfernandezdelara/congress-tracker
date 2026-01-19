/**
 * GovInfo API helpers for Congressional Record Daily Digest.
 */

import { fetchJsonWithRetry, type FetchConfig } from "./fetch";
import type { DailyDigestItem } from "./types";

const GOVINFO_BASE = "https://api.govinfo.gov";

interface GovInfoPublishedPackage {
  packageId?: string;
  title?: string;
  dateIssued?: string;
}

interface GovInfoPublishedResponse {
  packages?: GovInfoPublishedPackage[];
}

interface GovInfoPackageSummary {
  title?: string;
  dateIssued?: string;
  pdfDailyDigestLink?: string;
  htmlLink?: string;
}

interface GovInfoGranule {
  granuleId?: string;
  title?: string;
}

interface GovInfoGranulesResponse {
  granules?: GovInfoGranule[];
}

interface GovInfoGranuleSummary {
  title?: string;
  htmlLink?: string;
  textLink?: string;
  pdfLink?: string;
}

function buildGovInfoUrl(
  path: string,
  params: Record<string, string>,
  apiKey: string
): string {
  const url = new URL(`${GOVINFO_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  url.searchParams.set("api_key", apiKey);
  return url.toString();
}

function normalizeDate(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback;
  if (value.length >= 10) return value.slice(0, 10);
  return fallback;
}

export interface DailyDigestResult {
  item: DailyDigestItem | null;
  error?: string;
}

export async function fetchDailyDigest(
  date: string,
  apiKey: string,
  config: FetchConfig = {}
): Promise<DailyDigestResult> {
  const publishedUrl = buildGovInfoUrl(
    `/published/${date}/${date}`,
    {
      collection: "CREC",
      docClass: "DIGEST",
      offsetMark: "*",
      pageSize: "10",
    },
    apiKey
  );

  const published = await fetchJsonWithRetry<GovInfoPublishedResponse>(
    publishedUrl,
    config
  );
  if (!published.success) {
    return {
      item: null,
      error: `GovInfo published lookup failed: ${published.error ?? "unknown error"}`,
    };
  }

  const pkg = published.data?.packages?.[0];
  if (!pkg?.packageId) {
    // No digest published for this date (common on weekends/holidays).
    return { item: null };
  }

  const summaryUrl = buildGovInfoUrl(
    `/packages/${pkg.packageId}/summary`,
    {},
    apiKey
  );
  const summary = await fetchJsonWithRetry<GovInfoPackageSummary>(
    summaryUrl,
    config
  );

  const digestTitle =
    summary.data?.title ?? pkg.title ?? "Congressional Record Daily Digest";
  const digestDate = normalizeDate(
    summary.data?.dateIssued ?? pkg.dateIssued,
    date
  );
  const digestUrl = summary.data?.pdfDailyDigestLink ?? summary.data?.htmlLink;

  let senateSectionUrl: string | undefined;
  const granulesUrl = buildGovInfoUrl(
    `/packages/${pkg.packageId}/granules`,
    { offsetMark: "*", pageSize: "200" },
    apiKey
  );
  const granules = await fetchJsonWithRetry<GovInfoGranulesResponse>(
    granulesUrl,
    config
  );
  const senateGranule = granules.data?.granules?.find((granule) =>
    (granule.title ?? "").toLowerCase().includes("senate")
  );

  if (granules.success && senateGranule?.granuleId) {
    const granuleSummaryUrl = buildGovInfoUrl(
      `/packages/${pkg.packageId}/granules/${senateGranule.granuleId}/summary`,
      {},
      apiKey
    );
    const granuleSummary = await fetchJsonWithRetry<GovInfoGranuleSummary>(
      granuleSummaryUrl,
      config
    );
    senateSectionUrl =
      granuleSummary.data?.textLink ??
      granuleSummary.data?.htmlLink ??
      granuleSummary.data?.pdfLink;
  }

  return {
    item: {
      source: "govinfo",
      type: "daily_digest",
      date: digestDate,
      title: digestTitle,
      url: digestUrl,
      senate_section_url: senateSectionUrl,
    },
  };
}
