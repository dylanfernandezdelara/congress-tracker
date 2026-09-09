/** Shared JSON contracts for /share/* — consumed by worker and web. */

/** Where a shared quote was verified against. */
export type BillQuoteSource = 'digest' | 'crs' | 'bill_text' | 'answer'

export interface BillQuoteBill {
  congress: number
  type: string
  number: number
}

export interface BillQuote {
  /** Stable content-derived id (hex). Same bill + same text → same id. */
  id: string
  bill: BillQuoteBill
  /** Display text: trimmed, whitespace collapsed, original casing. */
  text: string
  source: BillQuoteSource
  created_at: string
}

export interface CreateBillQuoteRequest {
  /** Canonical bill param, e.g. `119-hr-1`. */
  bill: string
  text: string
  /**
   * Required when the quote comes from a chat answer (PR B). The worker
   * verifies `sig` (HMAC over `bill-chat-answer\n<bill>\n<text>`, so it is
   * bound to `bill`) before accepting the quote.
   */
  answer?: { text: string; sig: string }
}

export interface CreateBillQuoteResponse {
  quote: BillQuote
  /**
   * Share URL on the origin that serves it: `https://trackcongress.org/?bill=…&quote=…`
   * in production, the request's own origin on preview / local hosts.
   */
  url: string
}

export interface GetBillQuoteResponse {
  quote: BillQuote
}

export type CreateBillQuoteError =
  | 'bad_request'
  | 'quote_too_short'
  | 'quote_too_long'
  | 'bill_not_found'
  | 'quote_not_in_bill'
  | 'rate_limited'
  | 'unsupported_source'

export const BILL_QUOTE_MIN_CHARS = 12
export const BILL_QUOTE_MAX_CHARS = 280
/** Query parameter carrying a shared quote id on `/?bill=…&quote=…`. */
export const BILL_QUOTE_QUERY_PARAM = 'quote'
