/**
 * Shared Congress.gov client primitives: the API base, URL builder, and bill
 * type/number normalization + key. Previously these were duplicated verbatim
 * across `congress.ts` (member/legislation/meeting/daily-record fetching) and
 * `bill-evidence.ts` (multi-endpoint evidence harvesting). Both now build URLs
 * and normalize bill refs through this one module.
 */
import type { BillRef } from "../types";

export const CONGRESS_API_BASE = "https://api.congress.gov/v3";

/** Build a Congress.gov v3 URL with JSON format + api_key and extra params. */
export function buildCongressUrl(
  path: string,
  params: Record<string, string | number | boolean>,
  apiKey: string
): string {
  const url = new URL(`${CONGRESS_API_BASE}${path}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Normalize a bill type label (e.g. "H.R." -> "hr") to the API slug. */
export function normalizeBillType(value: string): string {
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

/** Extract the numeric portion of a bill number. */
export function normalizeBillNumber(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "";
  const match = cleaned.match(/\d+/);
  return match ? match[0] : cleaned;
}

/** Stable `${congress}-${type}-${number}` key for a bill reference. */
export function buildBillKey(ref: BillRef): string {
  const type = normalizeBillType(ref.type);
  const number = normalizeBillNumber(ref.number);
  return `${ref.congress}-${type}-${number}`;
}
