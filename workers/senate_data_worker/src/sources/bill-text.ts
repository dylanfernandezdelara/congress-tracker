import type { Env } from "../config";
import {
  BILL_TEXT_MAX_BYTES,
  TEXT_CHANGES_MAX_LISTED_PROVISIONS,
  USER_AGENT,
} from "../constants";
import type { BillRef } from "../types";
import type { BillAddedProvision, BillTextChanges } from "../../../../shared/bill-text-api-types";
import { fetchJson, fetchText } from "./http";

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

/** Normalized section identity — trailing punctuation and case vary between prints. */
function sectionKey(label: string): string {
  return label.replace(/[.\s]+$/, "").toLowerCase();
}

export interface AddedSectionsResult {
  added: BillAddedProvision[];
  moreAddedCount: number;
}

/**
 * Sections present in `latest` whose numbering does not appear in `basis`.
 *
 * Matching on section numbering (not heading text) is deliberate: a reworded
 * heading under the same section number is an edit, not an added provision, and
 * reporting it would be misleading.
 */
export function diffAddedSections(
  basis: BillSection[],
  latest: BillSection[],
  limit: number = TEXT_CHANGES_MAX_LISTED_PROVISIONS
): AddedSectionsResult {
  const basisKeys = new Set(basis.map((section) => sectionKey(section.label)));
  const seen = new Set<string>();
  const added: BillAddedProvision[] = [];
  let total = 0;

  for (const section of latest) {
    const key = sectionKey(section.label);
    if (basisKeys.has(key) || seen.has(key)) continue;
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

/** Guard the cron against pathologically large documents (e.g. omnibus prints). */
async function fetchBillTextXml(url: string): Promise<string | null> {
  const head = await fetch(url, { method: "HEAD", headers: { "User-Agent": USER_AGENT } });
  if (head.ok) {
    const declared = Number.parseInt(head.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declared) && declared > BILL_TEXT_MAX_BYTES) return null;
  }
  return fetchText(url);
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

  const [basisXml, latestXml] = await Promise.all([
    fetchBillTextXml(summaryVersion.xmlUrl),
    fetchBillTextXml(latestVersion.xmlUrl),
  ]);
  if (basisXml === null || latestXml === null) return null;

  const { added, moreAddedCount } = diffAddedSections(
    parseBillSections(basisXml),
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
