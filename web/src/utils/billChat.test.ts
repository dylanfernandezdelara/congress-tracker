import { describe, expect, it } from 'vitest'

import {
  capSelection,
  fitPassageForQuote,
  selectionChipLabel,
  splitProseParagraphs,
  starterChipsFromKeyPoints,
} from './billChat'

const SECTION =
  'Not later than 1 year after the date of enactment of this Act, the Secretary shall complete an environmental review for any covered energy or mineral project. The Secretary may extend the deadline by not more than 90 days if the applicant agrees in writing. A permit not acted on by the deadline shall be deemed approved.'

describe('fitPassageForQuote', () => {
  it('returns short passages unchanged apart from whitespace normalization', () => {
    expect(fitPassageForQuote('  A widget   is a device.  ')).toBe('A widget is a device.')
  })

  it('keeps whole sentences while they fit under the cap', () => {
    const fitted = fitPassageForQuote(SECTION)
    expect(fitted.length).toBeLessThanOrEqual(280)
    expect(fitted).toBe(
      'Not later than 1 year after the date of enactment of this Act, the Secretary shall complete an environmental review for any covered energy or mineral project. The Secretary may extend the deadline by not more than 90 days if the applicant agrees in writing.',
    )
    expect(SECTION.startsWith(fitted)).toBe(true)
  })

  it('cuts a single over-long sentence at a word boundary', () => {
    const long = `${'word '.repeat(80)}end.`
    const fitted = fitPassageForQuote(long, 50)
    expect(fitted.length).toBeLessThanOrEqual(50)
    expect(fitted.endsWith('word')).toBe(true)
    expect(long.startsWith(fitted)).toBe(true)
  })
})

describe('starter chips and selection helpers', () => {
  it('adds up to two key-point chips after the fixed starters', () => {
    expect(starterChipsFromKeyPoints(['Sets deadlines.', 'Expands leasing.', 'Ignored'])).toEqual([
      'What does this bill do?',
      'Who is affected?',
      'Explain: Sets deadlines.',
      'Explain: Expands leasing.',
    ])
  })

  it('caps selections and labels them at a word boundary', () => {
    const selection = 'x'.repeat(2000)
    expect(capSelection(selection).length).toBeLessThan(2000)
    expect(selectionChipLabel('Speeds up federal permitting for energy and mineral projects and rolls back')).toMatch(
      /…$/,
    )
  })

  it('splits prose into paragraphs on blank lines', () => {
    expect(splitProseParagraphs('One.\n\nTwo.\n\n\nThree.')).toEqual(['One.', 'Two.', 'Three.'])
  })
})
