import { describe, expect, it } from 'vitest'

import {
  checkQuoteLength,
  cleanQuoteText,
  digestQuoteSourceText,
  findQuoteSource,
  normalizeForQuoteMatch,
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
    expect(findQuoteSource('speeds ENERGY  permits and "smart"', sources)).toBe('digest')
    expect(findQuoteSource('amends title 5', sources)).toBe('crs')
    expect(findQuoteSource('not in any source', sources)).toBeNull()
    expect(findQuoteSource('   ', sources)).toBeNull()
  })

  it('joins the visible digest fields into one searchable text', () => {
    const text = digestQuoteSourceText({
      headline: 'Headline',
      what_it_does: 'Does things.',
      key_points: ['Point one', 'Point two'],
      terms_explained: [{ term: 'CBO', plain: 'Congressional Budget Office' }],
    })
    expect(text).toContain('Headline')
    expect(text).toContain('Point two')
    expect(text).toContain('Congressional Budget Office')
    expect(digestQuoteSourceText(null)).toBe('')
  })
})
