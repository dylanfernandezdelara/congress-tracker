import { describe, expect, it } from 'vitest'

import {
  buildQuoteMatcher,
  checkQuoteLength,
  cleanQuoteText,
  digestQuoteSourceText,
  findQuoteInText,
  findQuoteSource,
  normalizeForQuoteMatch,
  quoteBelongsToBill,
  textContainsQuote,
} from './quote-verification'

describe('quote verification', () => {
  it('cleans display text without changing casing', () => {
    expect(cleanQuoteText('  Speeds   energy\n permits ')).toBe('Speeds energy permits')
  })

  it('normalizes typographic punctuation and case for matching', () => {
    expect(normalizeForQuoteMatch('“Smart” grids — faster…')).toBe('"smart" grids - faster...')
    expect(normalizeForQuoteMatch('It’s\u00A0law')).toBe("it's law")
  })

  it('enforces length bounds on the cleaned text', () => {
    expect(checkQuoteLength('short')).toBe('too_short')
    expect(checkQuoteLength('a'.repeat(12))).toBe('ok')
    expect(checkQuoteLength('a'.repeat(281))).toBe('too_long')
  })

  it('finds the first source containing the quote, tolerant of whitespace and quotes', () => {
    const sources = [
      { source: 'digest' as const, text: 'Speeds energy permits and “smart” production.' },
      { source: 'crs' as const, text: 'This bill amends title 5 to speed permits.' },
    ]
    expect(findQuoteSource('speeds ENERGY  permits and "smart"', sources)?.source).toBe('digest')
    expect(findQuoteSource('amends title 5', sources)?.source).toBe('crs')
    expect(findQuoteSource('not in any source', sources)).toBeNull()
    expect(findQuoteSource('   ', sources)).toBeNull()
  })

  it('returns the matching source object so callers can keep extra fields', () => {
    const sources = [{ source: 'bill_text' as const, text: 'The Secretary shall act.', label: 'Sec. 2' }]
    expect(findQuoteSource('secretary shall', sources)?.label).toBe('Sec. 2')
  })

  it('only treats the selectable digest fields as sources', () => {
    const text = digestQuoteSourceText({
      headline: 'Headline',
      what_it_does: 'Does things.',
      key_points: ['Point one', 'Point two'],
      terms_explained: [{ term: 'CBO', plain: 'Congressional Budget Office' }],
    })
    expect(text).toContain('Does things.')
    expect(text).toContain('Point two')
    expect(text).not.toContain('Headline')
    expect(text).not.toContain('Congressional Budget Office')
    expect(digestQuoteSourceText(null)).toBe('')
  })

  it('checks quote ownership case-insensitively on the bill type', () => {
    const quote = { bill: { congress: 119, type: 'HR', number: 1 } }
    expect(quoteBelongsToBill(quote, { congress: 119, type: 'hr', number: 1 })).toBe(true)
    expect(quoteBelongsToBill(quote, { congress: 119, type: 'S', number: 1 })).toBe(false)
    expect(quoteBelongsToBill(quote, { congress: 118, type: 'HR', number: 1 })).toBe(false)
  })
})

describe('quote highlighting', () => {
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

  it('highlights every quote the verifier accepts (lockstep contract)', () => {
    const source =
      'Not later than 1 year — “deemed approved” — the Secretary’s review (§ 2(a)) ends… Fees: $5.'
    const selections = [
      'not later than 1 YEAR - "deemed approved"',
      "the Secretary's   review (§ 2(a)) ends...",
      'Fees: $5.',
      'Not later than 1 year \u2014 \u201Cdeemed approved\u201D',
      'review (§ 2(a)) ends\u2026 Fees',
    ]
    for (const selection of selections) {
      const verified = findQuoteSource(selection, [{ source: 'digest' as const, text: source }])
      expect(verified, selection).not.toBeNull()
      expect(findQuoteInText(source, cleanQuoteText(selection)), selection).not.toBeNull()
    }
  })
})
