import type { Env } from "../config";
import {
  BILL_TEXT_MAX_BYTES,
  TEXT_CHANGES_MAX_LISTED_PROVISIONS,
  USER_AGENT,
} from "../constants";
import type { BillRef } from "../types";
import type { BillAddedProvision, BillTextChanges } from "../../../../shared/bill-text-api-types";
import { fetchJson, redactUrl } from "./http";

interface TextVersionFormat {
  type?: string;
  url?: string;
}

interface TextVersionItem {
  type?: string;
  date?: string;
  formats?: TextVersionFormat[];
}

interface BillTextResponse {
  textVersions?: TextVersionItem[];
}

interface SummaryItem {
  actionDate?: string;
  actionDesc?: string;
  updateDate?: string;
}

interface BillSummariesResponse {
  summaries?: SummaryItem[];
}

/** A published bill text version with a fetchable XML document. */
export interface BillTextVersion {
  type: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  xmlUrl: string;
}

export interface BillSection {
  label: string;
  heading: string;
}

/**
 * Section enum + heading pairs from a Congress.gov bill XML document.
 *
 * Sections without a plain-text `<header>` (or with nested markup inside it)
 * are skipped: a missed section can only suppress a callout, never invent one.
 * Sections inside `<quoted-block>` are intentionally included — provisions
 * inserted into existing code (e.g. `303A.`) are real added text.
 */
export function parseBillSections(xml: string): BillSection[] {
  const out: BillSection[] = [];
  const pattern = /<section[^>]*>\s*<enum>([^<]*)<\/enum>\s*<header>([^<]*)<\/header>/g;
  for (const match of xml.matchAll(pattern)) {
    const label = match[1]!.trim();
    const heading = match[2]!.replace(/\s+/g, " ").trim();
    if (!label || !heading) continue;
    out.push({ label, heading });
  }
  return out;
}

/** Normalized section number — trailing punctuation and case vary between prints. */
function sectionKey(label: string): string {
  return label.replace(/[.\s]+$/, "").toLowerCase();
}

/** Normalized heading text — prints vary in case, spacing, and quote glyphs. */
function headingKey(heading: string): string {
  return heading
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .trim()
    .toLowerCase();
}

export interface AddedSectionsResult {
  added: BillAddedProvision[];
  moreAddedCount: number;
}

/**
 * Sections in `latest` that have no counterpart in `basis`.
 *
 * Matching is heading-first because section numbers are not stable identities:
 * inserting one section renumbers every section after it, so a number-based
 * diff names the renumbered neighbour instead of the provision that was
 * actually added. Headings alone are not sufficient either — a heading reworded
 * in place would look like an addition — so a heading-unmatched section is
 * treated as an edit when the basis still has an unmatched section under the
 * same number. Each basis section is consumed by at most one match so repeated
 * headings cannot mask an addition.
 */
export function diffAddedSections(
  basis: BillSection[],
  latest: BillSection[],
  limit: number = TEXT_CHANGES_MAX_LISTED_PROVISIONS
): AddedSectionsResult {
  const unmatchedByHeading = new Map<string, BillSection[]>();
  for (const section of basis) {
    const key = headingKey(section.heading);
    const pool = unmatchedByHeading.get(key);
    if (pool) pool.push(section);
    else unmatchedByHeading.set(key, [section]);
  }

  const candidates: BillSection[] = [];
  for (const section of latest) {
    const pool = unmatchedByHeading.get(headingKey(section.heading));
    if (pool && pool.length > 0) {
      pool.shift();
      continue;
    }
    candidates.push(section);
  }

  const unmatchedBasisLabels = new Set<string>();
  for (const pool of unmatchedByHeading.values()) {
    for (const section of pool) unmatchedBasisLabels.add(sectionKey(section.label));
  }

  const seen = new Set<string>();
  const added: BillAddedProvision[] = [];
  let total = 0;

  for (const section of candidates) {
    const labelKey = sectionKey(section.label);
    if (unmatchedBasisLabels.has(labelKey)) {
      unmatchedBasisLabels.delete(labelKey);
      continue;
    }
    const key = `${labelKey}|${headingKey(section.heading)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += 1;
    if (added.length < limit) {
      added.push({ label: section.label, heading: section.heading });
    }
  }

  return { added, moreAddedCount: Math.max(0, total - added.length) };
}

function isoDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function xmlFormatUrl(version: TextVersionItem): string | null {
  for (const format of version.formats ?? []) {
    if ((format.type ?? "").toUpperCase().includes("XML") && format.url) {
      return format.url;
    }
  }
  return null;
}

/** Published versions that have an XML document, oldest first. */
export function usableTextVersions(versions: TextVersionItem[]): BillTextVersion[] {
  const out: BillTextVersion[] = [];
  for (const version of versions) {
    const date = isoDate(version.date);
    const xmlUrl = xmlFormatUrl(version);
    if (!date || !xmlUrl || !version.type) continue;
    out.push({ type: version.type, date, xmlUrl });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

/**
 * The version a CRS summary describes: the newest text published on or before
 * the summary's action date. Congress.gov does not link summaries to text
 * versions, and summary `versionCode`s are not stable across bill types, so the
 * publication date is the most reliable join available.
 */
export function selectSummaryBasisVersion(
  versions: BillTextVersion[],
  summaryDate: string | null
): BillTextVersion | null {
  if (!summaryDate) return null;
  let basis: BillTextVersion | null = null;
  for (const version of versions) {
    if (version.date <= summaryDate) basis = version;
  }
  return basis;
}

/** Newest summary by update time — matches the digest pipeline's choice. */
export function selectLatestSummary(summaries: SummaryItem[]): SummaryItem | null {
  if (summaries.length === 0) return null;
  return [...summaries].sort((a, b) =>
    (a.updateDate ?? "").localeCompare(b.updateDate ?? "")
  )[summaries.length - 1]!;
}

export interface BillTextChangesSource {
  summaryDate: string | null;
  summaryVersion: BillTextVersion | null;
  latestVersion: BillTextVersion | null;
}

function billPathSegment(type: string): string {
  return type.toLowerCase();
}

/**
 * Version metadata needed to decide whether a text comparison is worth doing.
 * Two cheap JSON requests; no bill text is downloaded here.
 */
export async function fetchBillTextChangesSource(
  env: Env,
  bill: BillRef
): Promise<BillTextChangesSource> {
  const apiKey = env.CONGRESS_API_KEY;
  const base = `https://api.congress.gov/v3/bill/${bill.congress}/${billPathSegment(bill.type)}/${bill.number}`;

  const [textRes, summariesRes] = await Promise.all([
    fetchJson<BillTextResponse>(`${base}/text?format=json&limit=250&api_key=${apiKey}`),
    fetchJson<BillSummariesResponse>(`${base}/summaries?format=json&api_key=${apiKey}`),
  ]);

  const versions = usableTextVersions(textRes.textVersions ?? []);
  const summaryDate = isoDate(selectLatestSummary(summariesRes.summaries ?? [])?.actionDate);

  return {
    summaryDate,
    summaryVersion: selectSummaryBasisVersion(versions, summaryDate),
    latestVersion: versions.length > 0 ? versions[versions.length - 1]! : null,
  };
}

/**
 * Guard the cron against pathologically large documents (e.g. omnibus prints).
 *
 * The limit is enforced while reading the body rather than from a declared
 * `Content-Length`, which Congress.gov omits on chunked responses. Returns null
 * when the document is too large to diff.
 */
async function fetchBillTextXml(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${redactUrl(url)}`);

  const declared = Number.parseInt(res.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > BILL_TEXT_MAX_BYTES) {
    await res.body?.cancel().catch(() => {});
    return null;
  }

  const reader = res.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > BILL_TEXT_MAX_BYTES) return null;
      chunks.push(value);
    }
  } finally {
    // Releases the connection on the oversize path and on a mid-stream throw.
    await reader.cancel().catch(() => {});
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // Decoding the merged bytes avoids splitting a multi-byte character on a
  // chunk boundary.
  return new TextDecoder().decode(merged);
}

/**
 * Compare the summarized text against the newest text. Returns null when there
 * is nothing meaningful to show: same version, no summary, or no added sections.
 */
export async function compareBillText(
  source: BillTextChangesSource
): Promise<BillTextChanges | null> {
  const { summaryVersion, latestVersion } = source;
  if (!summaryVersion || !latestVersion) return null;
  if (summaryVersion.xmlUrl === latestVersion.xmlUrl) return null;

  // Fetched one at a time so only one bill text is resident at a time — two
  // large prints held together are the worst case for Worker memory.
  const basisXml = await fetchBillTextXml(summaryVersion.xmlUrl);
  if (basisXml === null) return null;

  const basisSections = parseBillSections(basisXml);
  // Simple resolutions and a few unusual prints expose no parseable sections.
  // Without a basis to compare against, every section of the newer text would
  // look added, so report nothing rather than a fabricated list.
  if (basisSections.length === 0) return null;

  const latestXml = await fetchBillTextXml(latestVersion.xmlUrl);
  if (latestXml === null) return null;

  const { added, moreAddedCount } = diffAddedSections(
    basisSections,
    parseBillSections(latestXml)
  );
  if (added.length === 0) return null;

  return {
    summary_version: summaryVersion.type,
    summary_version_date: summaryVersion.date,
    latest_version: latestVersion.type,
    latest_version_date: latestVersion.date,
    added_provisions: added,
    more_added_count: moreAddedCount,
  };
}
