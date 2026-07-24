const FALLBACK_HEADLINE_MAX_CHARS = 110
const FALLBACK_HEADLINE_MIN_CLAUSE_CHARS = 60

/** Leading legislative boilerplate safe to strip when a meaningful remainder remains. */
const LEADING_TITLE_BOILERPLATE = /^(?:A bill to |An act to |To )(.+)$/i

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function capitalizeFirst(text: string): string {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function stripLeadingBoilerplate(title: string): string {
  const match = title.match(LEADING_TITLE_BOILERPLATE)
  if (!match) return title

  const remainder = match[1]?.trim() ?? ''
  if (!remainder) return title

  return capitalizeFirst(remainder)
}

function truncateOfficialTitle(
  text: string,
  maxChars: number = FALLBACK_HEADLINE_MAX_CHARS,
  minClauseChars: number = FALLBACK_HEADLINE_MIN_CLAUSE_CHARS,
): string {
  if (text.length <= maxChars) return text

  const window = text.slice(0, maxChars)
  const lastComma = window.lastIndexOf(', ')
  const lastSemi = window.lastIndexOf('; ')
  const clauseAt = Math.max(lastComma, lastSemi)

  if (clauseAt >= minClauseChars) {
    return `${window.slice(0, clauseAt).trimEnd()}…`
  }

  const lastSpace = window.lastIndexOf(' ')
  if (lastSpace > 0) {
    return `${window.slice(0, lastSpace).trimEnd()}…`
  }

  return text
}

/** Soften official bill titles for feed headlines when no digest exists. */
export function formatFallbackHeadline(title: string): string {
  const collapsed = collapseWhitespace(title)
  if (!collapsed) return collapsed

  return truncateOfficialTitle(stripLeadingBoilerplate(collapsed))
}
