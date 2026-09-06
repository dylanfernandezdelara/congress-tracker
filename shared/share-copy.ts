import {
  formatBillDocket,
  formatBillQueryParam,
  trimDisplayTitle,
} from './bill-id'
import { formatExpandedCrsLead, truncateAtSentenceBoundary } from './digest-format'
import { proceduralHeadline } from './procedural-titles'

/** Canonical production origin for share URLs and OG tags. */
export const PRODUCTION_ORIGIN = 'https://trackcongress.org'
export const OG_DESCRIPTION_MAX_CHARS = 180

export type ShareBillRef = {
  congress: number
  type: string
  number: number
}

export type ShareCopyFields = {
  headline?: string | null
  whatItDoes?: string | null
  crsSummary?: string | null
  title?: string | null
  bill: ShareBillRef
}

export type ShareCopy = {
  title: string
  text: string
}

/** Loose digest parse so title-only intros still yield a headline. */
export function parseShareDigestJson(json: string | null | undefined): {
  headline: string | null
  whatItDoes: string | null
} {
  if (!json?.trim()) return { headline: null, whatItDoes: null }
  try {
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') {
      return { headline: null, whatItDoes: null }
    }
    const record = parsed as Record<string, unknown>
    const headline = typeof record.headline === 'string' ? record.headline.trim() || null : null
    const whatItDoes =
      typeof record.what_it_does === 'string' ? record.what_it_does.trim() || null : null
    return { headline, whatItDoes }
  } catch {
    return { headline: null, whatItDoes: null }
  }
}

/** Shared title/body for the share sheet and bill OG rewrite. */
export function buildShareCopy(fields: ShareCopyFields): ShareCopy {
  const docket = formatBillDocket(fields.bill.type, fields.bill.number, fields.bill.congress)
  const headline = fields.headline?.trim() || null
  const officialTitle = fields.title?.trim() || null
  const title =
    (headline ? trimDisplayTitle(headline) : '') ||
    (officialTitle ? proceduralHeadline(officialTitle) || trimDisplayTitle(officialTitle) : '') ||
    docket
  const crsLead = fields.crsSummary?.trim() ? formatExpandedCrsLead(fields.crsSummary) : ''
  const text =
    fields.whatItDoes?.trim() ||
    crsLead ||
    (officialTitle ? trimDisplayTitle(officialTitle) : '') ||
    docket
  return { title, text }
}

export function buildBillOgFields(
  copy: ShareCopy,
  bill: ShareBillRef,
): { title: string; description: string; url: string } {
  return {
    title: copy.title,
    description: truncateAtSentenceBoundary(copy.text, OG_DESCRIPTION_MAX_CHARS),
    url: `${PRODUCTION_ORIGIN}/?bill=${formatBillQueryParam(bill)}`,
  }
}
