/**
 * GovInfo API helpers for Congressional Record Daily Digest.
 */

import { fetchJsonWithRetry, type FetchConfig } from "./fetch";
import { mapWithConcurrency } from "./concurrency";
import type { DailyDigestItem } from "./types";

const GOVINFO_BASE = "https://api.govinfo.gov";

interface GovInfoPublishedPackage {
  packageId?: string;
  title?: string;
  dateIssued?: string;
  docClass?: string;
}

interface GovInfoPublishedResponse {
  packages?: GovInfoPublishedPackage[];
}

interface GovInfoPackageSummary {
  title?: string;
  dateIssued?: string;
  detailsLink?: string;
  download?: {
    pdfLink?: string;
    txtLink?: string;
    zipLink?: string;
    modsLink?: string;
    premisLink?: string;
  };
}

interface GovInfoGranule {
  granuleId?: string;
  title?: string;
  granuleClass?: string;
}

interface GovInfoGranulesResponse {
  count?: number;
  granules?: GovInfoGranule[];
}

interface GovInfoGranuleSummary {
  title?: string;
  granuleId?: string;
  dateIssued?: string;
  packageId?: string;
  granuleClass?: string;
  subGranuleClass?: string;
  committees?: Array<{
    authorityId?: string;
    chamber?: string;
    committeeName?: string;
    type?: string;
  }>;
  members?: Array<{
    bioGuideId?: string;
    memberName?: string;
    chamber?: string;
    state?: string;
    party?: string;
  }>;
  download?: {
    pdfLink?: string;
    txtLink?: string;
    zipLink?: string;
    modsLink?: string;
    premisLink?: string;
  };
}

export interface GovInfoCrecGranuleHighlight {
  source: "govinfo";
  package_id: string;
  granule_id: string;
  date: string;
  title: string;
  granule_class?: string;
  sub_granule_class?: string;
  member_bioguide_ids?: string[];
  member_names?: string[];
  committee_names?: string[];
  text_url?: string;
  pdf_url?: string;
}

interface GovInfoCrecGranuleOptions {
  maxPackages?: number;
  maxGranulesPerPackage?: number;
}

interface DigestGranuleCandidate {
  granuleId: string;
  title: string;
  granuleClass?: string;
  score: number;
}

function buildGovInfoUrl(
  path: string,
  params: Record<string, string | number>,
  apiKey: string
): string {
  const url = new URL(`${GOVINFO_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value));
  });
  url.searchParams.set("api_key", apiKey);
  return url.toString();
}

function normalizeDate(value: string | undefined | null, fallback: string): string {
  if (!value) return fallback;
  if (value.length >= 10) return value.slice(0, 10);
  return fallback;
}

function normalizeDateRangeInput(value: string): string {
  if (value.length >= 10) return value.slice(0, 10);
  return value;
}

function pickGovInfoDownloadLink(
  summary: GovInfoPackageSummary | GovInfoGranuleSummary | null | undefined
): string | undefined {
  const download = summary?.download;
  if (!download) return undefined;
  return download.pdfLink ?? download.txtLink ?? download.modsLink ?? download.zipLink;
}

function scoreDigestGranule(granule: GovInfoGranule): number {
  const title = (granule.title ?? "").toLowerCase();
  const granuleClass = (granule.granuleClass ?? "").toLowerCase();

  if (title.includes("daily digest/senate committee meetings")) return 500;
  if (title.includes("daily digest/senate")) return 450;
  if (title.includes("daily digest")) return 400;
  if (title.includes("next meeting of the senate")) return 350;
  if (granuleClass === "dailydigest") return 300;
  if (title.includes("senate")) return 200;
  return 0;
}

function pickDigestGranule(granules: GovInfoGranule[]): DigestGranuleCandidate | null {
  const scored: DigestGranuleCandidate[] = [];
  for (const granule of granules) {
    const granuleId = granule.granuleId?.trim();
    if (!granuleId) continue;
    scored.push({
      granuleId,
      title: granule.title?.trim() ?? granuleId,
      granuleClass: granule.granuleClass,
      score: scoreDigestGranule(granule),
    });
  }
  scored.sort((a, b) => b.score - a.score || a.granuleId.localeCompare(b.granuleId));

  return scored[0] ?? null;
}

async function fetchCrecPackageByDate(
  date: string,
  apiKey: string,
  config: FetchConfig
): Promise<{ package: GovInfoPublishedPackage | null; error?: string }> {
  const normalizedDate = normalizeDateRangeInput(date);
  const url = buildGovInfoUrl(
    `/published/${normalizedDate}/${normalizedDate}`,
    {
      collection: "CREC",
      offsetMark: "*",
      pageSize: "10",
    },
    apiKey
  );
  const result = await fetchJsonWithRetry<GovInfoPublishedResponse>(url, config);
  if (!result.success) {
    return {
      package: null,
      error: `GovInfo CREC package lookup failed: ${result.error ?? "unknown error"}`,
    };
  }
  const pkg =
    result.data?.packages?.find((item) => (item.packageId ?? "").startsWith("CREC-")) ??
    result.data?.packages?.[0] ??
    null;
  return { package: pkg };
}

async function fetchDigestFromPackage(
  pkg: GovInfoPublishedPackage,
  fallbackDate: string,
  apiKey: string,
  config: FetchConfig
): Promise<{ item: DailyDigestItem; error?: string }> {
  const packageId = pkg.packageId?.trim();
  if (!packageId) {
    return {
      item: {
        source: "govinfo",
        type: "daily_digest",
        date: fallbackDate,
        title: pkg.title?.trim() || "Congressional Record Daily Digest",
      },
      error: "GovInfo package is missing packageId",
    };
  }

  const summaryUrl = buildGovInfoUrl(`/packages/${packageId}/summary`, {}, apiKey);
  const summaryResult = await fetchJsonWithRetry<GovInfoPackageSummary>(summaryUrl, config);
  const summaryError = summaryResult.success
    ? undefined
    : `GovInfo package summary fetch failed: ${summaryResult.error ?? "unknown error"}`;

  const digestTitle =
    summaryResult.data?.title?.trim() ??
    pkg.title?.trim() ??
    "Congressional Record Daily Digest";
  const digestDate = normalizeDate(
    summaryResult.data?.dateIssued ?? pkg.dateIssued,
    fallbackDate
  );
  const digestUrl = pickGovInfoDownloadLink(summaryResult.data) ?? summaryResult.data?.detailsLink;

  const granulesUrl = buildGovInfoUrl(
    `/packages/${packageId}/granules`,
    { offsetMark: "*", pageSize: "250" },
    apiKey
  );
  const granulesResult = await fetchJsonWithRetry<GovInfoGranulesResponse>(granulesUrl, config);
  let granuleError: string | undefined;
  if (!granulesResult.success) {
    granuleError = `GovInfo granules lookup failed: ${granulesResult.error ?? "unknown error"}`;
  }

  let senateSectionUrl: string | undefined;
  let digestSummaryText: string | undefined;

  const selectedGranule = pickDigestGranule(granulesResult.data?.granules ?? []);
  if (selectedGranule) {
    const granuleSummaryUrl = buildGovInfoUrl(
      `/packages/${packageId}/granules/${selectedGranule.granuleId}/summary`,
      {},
      apiKey
    );
    const granuleSummaryResult = await fetchJsonWithRetry<GovInfoGranuleSummary>(
      granuleSummaryUrl,
      config
    );
    if (granuleSummaryResult.success && granuleSummaryResult.data) {
      senateSectionUrl = pickGovInfoDownloadLink(granuleSummaryResult.data);
      digestSummaryText = granuleSummaryResult.data.title?.trim();
    } else {
      granuleError = `GovInfo granule summary fetch failed: ${granuleSummaryResult.error ?? "unknown error"}`;
    }
  }

  const combinedError = [summaryError, granuleError].filter(Boolean).join(" | ") || undefined;
  return {
    item: {
      source: "govinfo",
      type: "daily_digest",
      date: digestDate,
      title: digestTitle,
      url: digestUrl,
      senate_section_url: senateSectionUrl,
      summary: digestSummaryText,
    },
    error: combinedError,
  };
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
  const normalizedDate = normalizeDateRangeInput(date);

  // First attempt: digest docClass lookup.
  const publishedUrl = buildGovInfoUrl(
    `/published/${normalizedDate}/${normalizedDate}`,
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
    // If digest-specific lookup fails, fallback to general CREC package lookup.
    const fallback = await fetchCrecPackageByDate(normalizedDate, apiKey, config);
    if (!fallback.package) {
      return {
        item: null,
        error: `GovInfo published lookup failed: ${published.error ?? "unknown error"} | ${fallback.error ?? "fallback package lookup failed"}`,
      };
    }
    const fallbackDigest = await fetchDigestFromPackage(
      fallback.package,
      normalizedDate,
      apiKey,
      config
    );
    return {
      item: fallbackDigest.item,
      error: fallbackDigest.error,
    };
  }

  const pkg = published.data?.packages?.[0];
  if (!pkg?.packageId) {
    // No digest package on this date. Try general CREC package for the same day.
    const fallback = await fetchCrecPackageByDate(normalizedDate, apiKey, config);
    if (!fallback.package) {
      return { item: null };
    }
    const fallbackDigest = await fetchDigestFromPackage(
      fallback.package,
      normalizedDate,
      apiKey,
      config
    );
    return {
      item: fallbackDigest.item,
      error: fallbackDigest.error,
    };
  }

  const digestResult = await fetchDigestFromPackage(pkg, normalizedDate, apiKey, config);
  return digestResult;
}

export async function fetchCrecSenateGranuleHighlights(
  windowStart: string,
  windowEnd: string,
  apiKey: string,
  config: FetchConfig = {},
  options: GovInfoCrecGranuleOptions = {}
): Promise<{ items: GovInfoCrecGranuleHighlight[]; error?: string }> {
  const maxPackages = Math.max(1, options.maxPackages ?? 6);
  const maxGranulesPerPackage = Math.max(1, options.maxGranulesPerPackage ?? 80);
  const normalizedStart = normalizeDateRangeInput(windowStart);
  const normalizedEnd = normalizeDateRangeInput(windowEnd);

  const publishedUrl = buildGovInfoUrl(
    `/published/${normalizedStart}/${normalizedEnd}`,
    {
      collection: "CREC",
      offsetMark: "*",
      pageSize: String(maxPackages),
    },
    apiKey
  );

  const publishedResult = await fetchJsonWithRetry<GovInfoPublishedResponse>(
    publishedUrl,
    config
  );
  if (!publishedResult.success) {
    return {
      items: [],
      error: `GovInfo CREC range lookup failed: ${publishedResult.error ?? "unknown error"}`,
    };
  }

  const packages = (publishedResult.data?.packages ?? [])
    .filter((pkg): pkg is GovInfoPublishedPackage => Boolean(pkg.packageId))
    .slice(0, maxPackages);

  if (packages.length === 0) {
    return { items: [] };
  }

  const packageResults = await mapWithConcurrency(
    packages,
    Math.max(1, Math.min(config.concurrency ?? 4, 4)),
    async (pkg) => {
      const packageId = pkg.packageId as string;
      const granulesUrl = buildGovInfoUrl(
        `/packages/${packageId}/granules`,
        { offsetMark: "*", pageSize: String(maxGranulesPerPackage) },
        apiKey
      );
      const granulesResult = await fetchJsonWithRetry<GovInfoGranulesResponse>(
        granulesUrl,
        config
      );
      if (!granulesResult.success) {
        return {
          items: [] as GovInfoCrecGranuleHighlight[],
          error: `GovInfo granules lookup failed for ${packageId}: ${granulesResult.error ?? "unknown error"}`,
        };
      }

      const senateGranules = (granulesResult.data?.granules ?? []).filter((granule) => {
        const granuleClass = (granule.granuleClass ?? "").toLowerCase();
        const title = (granule.title ?? "").toLowerCase();
        if (granuleClass === "senate") return true;
        if (granuleClass === "dailydigest" && title.includes("senate")) return true;
        return title.includes("senate");
      });

      const granuleItems = await mapWithConcurrency(
        senateGranules,
        Math.max(1, Math.min(config.concurrency ?? 4, 4)),
        async (granule) => {
          const granuleId = granule.granuleId?.trim();
          if (!granuleId) return null;
          const summaryUrl = buildGovInfoUrl(
            `/packages/${packageId}/granules/${granuleId}/summary`,
            {},
            apiKey
          );
          const summaryResult = await fetchJsonWithRetry<GovInfoGranuleSummary>(
            summaryUrl,
            config
          );
          if (!summaryResult.success || !summaryResult.data) {
            return null;
          }
          const summary = summaryResult.data;
          const memberBioguideIds = (summary.members ?? [])
            .map((member) => member.bioGuideId?.trim())
            .filter((value): value is string => Boolean(value));
          const memberNames = (summary.members ?? [])
            .map((member) => member.memberName?.trim())
            .filter((value): value is string => Boolean(value));
          const committeeNames = (summary.committees ?? [])
            .map((committee) => committee.committeeName?.trim())
            .filter((value): value is string => Boolean(value));

          const textUrl = summary.download?.txtLink;
          const pdfUrl = summary.download?.pdfLink;

          return {
            source: "govinfo",
            package_id: packageId,
            granule_id: granuleId,
            date: normalizeDate(summary.dateIssued, normalizedEnd),
            title: summary.title?.trim() || granule.title?.trim() || granuleId,
            granule_class: summary.granuleClass,
            sub_granule_class: summary.subGranuleClass,
            member_bioguide_ids: memberBioguideIds.length ? memberBioguideIds : undefined,
            member_names: memberNames.length ? memberNames : undefined,
            committee_names: committeeNames.length ? committeeNames : undefined,
            text_url: textUrl,
            pdf_url: pdfUrl,
          } satisfies GovInfoCrecGranuleHighlight;
        }
      );

      const items: GovInfoCrecGranuleHighlight[] = [];
      for (const item of granuleItems) {
        if (item) items.push(item);
      }
      return { items };
    }
  );

  const items = packageResults.flatMap((result) => result.items);
  const firstError = packageResults.find((result) => result.error)?.error;
  items.sort((a, b) => b.date.localeCompare(a.date));
  return {
    items,
    error: firstError,
  };
}
