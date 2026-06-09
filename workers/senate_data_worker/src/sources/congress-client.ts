import type { Env } from "../config";
import { congressNumber } from "../config";
import type { BillRef } from "../types";
import { stripHtmlToText } from "./html-clean";
import { fetchJson } from "./http";

interface BillSummary {
  text?: string;
  updateDate?: string;
}

interface BillSummariesResponse {
  summaries?: BillSummary[];
}

interface BillDetail {
  title?: string;
  policyArea?: { name?: string };
}

interface BillDetailResponse {
  bill?: BillDetail;
}

export interface BillSummaryBundle {
  title: string | null;
  policyArea: string | null;
  rawSummaryText: string | null;
}

function billPathSegment(type: string): string {
  const t = type.toLowerCase();
  if (t === "hr") return "hr";
  if (t === "s") return "s";
  if (t === "hres") return "hres";
  if (t === "sres") return "sres";
  if (t === "hjres") return "hjres";
  if (t === "sjres") return "sjres";
  return t;
}

export async function fetchBillSummaryBundle(
  env: Env,
  bill: BillRef
): Promise<BillSummaryBundle> {
  const apiKey = env.CONGRESS_API_KEY;
  const seg = billPathSegment(bill.type);
  const base = `https://api.congress.gov/v3/bill/${bill.congress}/${seg}/${bill.number}`;

  const [detailRes, summariesRes] = await Promise.all([
    fetchJson<BillDetailResponse>(`${base}?format=json&api_key=${apiKey}`),
    fetchJson<BillSummariesResponse>(`${base}/summaries?format=json&api_key=${apiKey}`),
  ]);

  const summaries = summariesRes.summaries ?? [];
  const latest = summaries.length
    ? [...summaries].sort((a, b) => (b.updateDate ?? "").localeCompare(a.updateDate ?? ""))[0]
    : null;

  return {
    title: detailRes.bill?.title ?? null,
    policyArea: detailRes.bill?.policyArea?.name ?? null,
    rawSummaryText: latest?.text ? stripHtmlToText(latest.text) : null,
  };
}

export function lookbackStartIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
