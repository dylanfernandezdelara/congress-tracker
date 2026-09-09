import { ApiError } from '../api/fetchJson'

/** User-facing copy for a failed `POST /share/quote`; validation errors pass through verbatim. */
export function shareQuoteErrorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'quote_too_short':
      case 'quote_too_long':
      case 'quote_not_in_bill':
      case 'rate_limited':
        return error.message
      default:
        break
    }
  }
  return "Couldn't create a quote link. Try again."
}
