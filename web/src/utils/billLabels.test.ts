import { describe, expect, it } from 'vitest'

import {
  formatBillDocket,
  proceduralHeadline,
  SUMMARY_PREVIEW_MAX_CHARS,
  summaryBodyText,
  summaryPreviewText,
  trimDisplayTitle,
} from './billLabels'

describe('formatBillDocket', () => {
  it('formats concurrent resolutions', () => {
    expect(formatBillDocket('hconres', 84, 119)).toBe('H.Con.Res. 84 · 119th Congress')
  })

  it('formats joint resolutions', () => {
    expect(formatBillDocket('HJRES', 12, 119)).toBe('H.J.Res. 12 · 119th Congress')
  })
})

describe('trimDisplayTitle', () => {
  it('removes the boilerplate suffix', () => {
    expect(trimDisplayTitle('Authorize support for Ukraine, and for other purposes.')).toBe(
      'Authorize support for Ukraine',
    )
  })

  it('removes the suffix without a leading comma', () => {
    expect(trimDisplayTitle('Sample bill and for other purposes.')).toBe('Sample bill')
  })
})

describe('summaryBodyText', () => {
  it('drops a heading line before the body', () => {
    const raw = 'Ukraine Support Act\n\nThis bill addresses military aid to Ukraine.'

    expect(summaryBodyText(raw)).toBe('This bill addresses military aid to Ukraine.')
  })

  it('keeps a single paragraph that starts with body text', () => {
    const raw = 'This bill addresses military aid to Ukraine.'

    expect(summaryBodyText(raw)).toBe('This bill addresses military aid to Ukraine.')
  })

  it('keeps text when the first line ends with sentence punctuation', () => {
    const raw = 'This is a complete sentence.\n\nMore detail follows here.'

    expect(summaryBodyText(raw)).toBe('This is a complete sentence. More detail follows here.')
  })

  it('returns the heading when there is no remainder', () => {
    expect(summaryBodyText('Ukraine Support Act')).toBe('Ukraine Support Act')
  })

  it('caps long raw summaries at a word boundary', () => {
    const raw = `Ukraine Support Act\n\n${'This bill provides support to Ukraine and allied countries through security assistance, financing, and oversight. '.repeat(5)}`
    const result = summaryBodyText(raw)

    expect(result.length).toBeLessThanOrEqual(SUMMARY_PREVIEW_MAX_CHARS)
    expect(result).toMatch(/…$/)
    expect(result).not.toMatch(/\s…$/)
  })
})

describe('summaryPreviewText', () => {
  it('caps generated digest summaries too', () => {
    const result = summaryPreviewText(
      'This bill provides a longer generated explanation for readers about funding, oversight, reporting, and assistance programs that should be concise on the front of the card. '.repeat(3),
    )

    expect(result.length).toBeLessThanOrEqual(SUMMARY_PREVIEW_MAX_CHARS)
    expect(result).toMatch(/…$/)
  })
})

describe('proceduralHeadline', () => {
  it('rewrites providing-for-consideration rule resolutions', () => {
    const title =
      'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.'

    expect(proceduralHeadline(title)).toBe(
      'Sets up House debate on H.R. 2913: Authorize support for Ukraine',
    )
  })

  it('rewrites rule-waiver resolutions', () => {
    const title =
      'Waiving a requirement of clause 6(a) of rule XIII with respect to consideration of certain resolutions reported from the Committee on Rules.'

    expect(proceduralHeadline(title)).toBe('Fast-tracks floor consideration (rule waiver)')
  })

  it('rewrites nullification resolutions', () => {
    const title =
      'Providing that section 11 of House Resolution 1224 shall have no force or effect.'

    expect(proceduralHeadline(title)).toBe('Nullifies section 11 of H.Res. 1224')
  })

  it('returns null for non-matching titles', () => {
    expect(proceduralHeadline('A regular bill title about infrastructure.')).toBeNull()
  })
})
