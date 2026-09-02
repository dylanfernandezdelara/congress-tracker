export const ENERGY_HEADLINE =
  'House passes a broad energy permitting and production package (local sample)'
export const LANDS_HEADLINE =
  'Senate passes a public lands conservation and access bill (local sample)'
export const OVERSIGHT_HEADLINE =
  'House passes a federal spending oversight bill (local sample)'
export const REQUIRED_HEADLINES = [ENERGY_HEADLINE, LANDS_HEADLINE, OVERSIGHT_HEADLINE]

const API_PATH_PATTERN =
  /^\/(?:(?:feed|stats)(?:\/[^?]*)?|health|debug\/[^?]+\.json)(?:\?|$)/

export function isAllowedApiPath(apiPath) {
  if (typeof apiPath !== 'string' || apiPath.includes('..')) return false
  return API_PATH_PATTERN.test(apiPath)
}

export function sampleHeadlines(items) {
  return (items || [])
    .map((item) => item?.digest?.headline || item?.bill?.title || '')
    .filter((text) => text.includes('(local sample)'))
}

export function seedFeedProblems(items) {
  if (!Array.isArray(items) || items.length === 0) return ['feed has no items']
  const errors = []
  const samples = sampleHeadlines(items)
  if (samples.length !== items.length) {
    errors.push(
      `feed is mixed: ${items.length} items, ${samples.length} local-sample. Verification D1 must be sample-only (isolated persist-to).`,
    )
  }
  for (const headline of REQUIRED_HEADLINES) {
    if (!samples.includes(headline)) {
      errors.push(`missing required sample headline: ${headline}`)
    }
  }
  return errors
}
