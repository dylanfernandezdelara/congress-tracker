import {
  formatBillQueryParam,
  formatShortBillId,
  parseBillQueryParam,
} from '@congress-tracker/shared/bill-id'
import { PRODUCTION_ORIGIN, buildShareCopy } from '@congress-tracker/shared/share-copy'

import type { FeedItem } from '../api/types'

export { formatBillQueryParam, parseBillQueryParam, PRODUCTION_ORIGIN }

export function feedRowKey(item: FeedItem): string {
  return `${item.bill.congress}-${item.bill.type}-${item.bill.number}`
}

export function itemMatchesBillParam(item: FeedItem, billParam: string): boolean {
  return formatBillQueryParam(item.bill) === billParam.trim().toLowerCase()
}

export function isProductionShareHost(hostname: string): boolean {
  return hostname === 'trackcongress.org' || hostname === 'www.trackcongress.org'
}

/** Production uses the apex origin; preview / workers.dev / local keep the current host. */
export function billShareOrigin(href = window.location.href): string {
  const url = new URL(href)
  if (isProductionShareHost(url.hostname)) return PRODUCTION_ORIGIN
  return url.origin
}

export function buildBillShareUrl(item: Pick<FeedItem, 'bill'>, href = window.location.href): string {
  return `${billShareOrigin(href)}/?bill=${formatBillQueryParam(item.bill)}`
}

/** `q=` value that matches feed bill-id search (`119-hr-1` → `H.R. 1`). */
export function billSearchQueryFromParam(billParam: string): string | null {
  const parsed = parseBillQueryParam(billParam)
  if (parsed) return formatShortBillId(parsed.type, parsed.number)
  const trimmed = billParam.trim()
  return trimmed || null
}

export type BillSharePayload = {
  title: string
  text: string
  url: string
  clipboardText: string
}

export function buildBillSharePayload(
  item: Pick<FeedItem, 'bill' | 'digest' | 'raw_summary_text'>,
  urlOverride?: string,
  href = window.location.href,
): BillSharePayload {
  const { title, text } = buildShareCopy({
    headline: item.digest?.headline,
    whatItDoes: item.digest?.what_it_does,
    crsSummary: item.raw_summary_text,
    title: item.bill.title,
    bill: item.bill,
  })
  const url = urlOverride ?? buildBillShareUrl(item, href)
  return {
    title,
    text,
    url,
    clipboardText: `${title}\n\n${text}\n\n${url}`,
  }
}

export function canUseWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

export async function shareBillViaNavigator(
  payload: BillSharePayload,
): Promise<'shared' | 'cancelled' | 'unavailable'> {
  if (!canUseWebShare()) return 'unavailable'
  try {
    await navigator.share({
      title: payload.title,
      text: payload.text,
      url: payload.url,
    })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    return 'unavailable'
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to prompt.
  }
  const result = window.prompt('Copy share text', text)
  return result !== null
}
