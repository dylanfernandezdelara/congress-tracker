import { fetchJson, nextPageUrl } from "./http";
import { normalizeBillType } from "./bill-type";
import type { BillRef } from "../types";

export interface UpdatedBill extends BillRef {
  title: string | null;
}

interface BillListResponse {
  bills?: Array<{ congress?: number; type?: string; number?: string | number; title?: string }>;
  pagination?: { next?: string };
}

/**
 * One page of every bill type updated in a window, oldest update first (Congress.gov `/bill/{congress}`).
 * Update dates are day-granular, so callers page by offset and restart the window with some overlap.
 */
export async function fetchUpdatedBillsPage(
  apiKey: string,
  params: { congress: number; fromIso: string; toIso: string; offset: number; limit: number }
): Promise<{ bills: UpdatedBill[]; hasMore: boolean }> {
  const url =
    `https://api.congress.gov/v3/bill/${params.congress}?format=json&sort=updateDate+asc` +
    `&fromDateTime=${params.fromIso.slice(0, 19)}Z&toDateTime=${params.toIso.slice(0, 19)}Z` +
    `&offset=${params.offset}&limit=${params.limit}&api_key=${apiKey}`;
  const body = await fetchJson<BillListResponse>(url);
  const bills: UpdatedBill[] = [];
  for (const b of body.bills ?? []) {
    const number = Number(b.number);
    if (!b.type || !Number.isFinite(number) || b.congress !== params.congress) continue;
    bills.push({ congress: params.congress, type: normalizeBillType(b.type), number, title: b.title?.trim() || null });
  }
  return { bills, hasMore: Boolean(nextPageUrl(body.pagination?.next, apiKey)) && (body.bills?.length ?? 0) >= params.limit };
}
