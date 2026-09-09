import { describe, expect, it } from 'vitest'

import { buildQuoteMatcher, findQuoteInText, textContainsQuote } from './quoteHighlight'

describe('quoteHighlight', () => {
  it('finds an exact quote and returns original offsets', () => {
    const text = 'The bill raises the cap. It also funds clinics.'
    expect(findQuoteInText(text, 'raises the cap')).toEqual({ start: 9, end: 23 })
  })

  it('tolerates casing, whitespace runs, and curly punctuation', () => {
    const text = 'It “protects” a state’s right — nothing more…'
    expect(findQuoteInText(text, 'it "PROTECTS"   a state\'s right - nothing more...')).toEqual({
      start: 0,
      end: text.length,
    })
  })

  it('escapes regex metacharacters in the quote', () => {
    const text = 'Allocates $5 (five) dollars per (a)(1).'
    expect(findQuoteInText(text, '$5 (five) dollars per (a)(1).')).toEqual({ start: 10, end: 39 })
  })

  it('returns null when the quote is absent or empty', () => {
    expect(findQuoteInText('Some text', 'missing passage')).toBeNull()
    expect(findQuoteInText('Some text', '   ')).toBeNull()
    expect(buildQuoteMatcher('')).toBeNull()
    expect(textContainsQuote(null, 'anything')).toBe(false)
    expect(textContainsQuote('anything here', 'anything')).toBe(true)
  })
})
