import type { FeedBill, FeedItem } from '../api/types'

/** Canonical share/deep-link form: `119-hr-1` (type lowercased). */
export function formatBillQueryParam(bill: Pick<FeedBill, 'congress' | 'type' | 'number'>): string {
  return `${bill.congress}-${bill.type.toLowerCase()}-${bill.number}`
}

export function feedRowKey(item: FeedItem): string {
  return `${item.bill.congress}-${item.bill.type}-${item.bill.number}`
}

export function itemMatchesBillParam(item: FeedItem, billParam: string): boolean {
  return formatBillQueryParam(item.bill) === billParam.trim().toLowerCase()
}

export function buildBillShareUrl(item: FeedItem, href = window.location.href): string {
  const url = new URL(href)
  url.searchParams.set('bill', formatBillQueryParam(item.bill))
  return url.toString()
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
  const result = window.prompt('Copy link', text)
  return result !== null
}
