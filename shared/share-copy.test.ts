import { describe, expect, it } from 'vitest'

import {
  PRODUCTION_ORIGIN,
  buildBillOgFields,
  buildShareCopy,
  parseShareDigestJson,
} from './share-copy'

describe('share copy', () => {
  it('parses optional digest fields without requiring a complete rewrite', () => {
    expect(parseShareDigestJson(null)).toEqual({ headline: null, whatItDoes: null })
    expect(parseShareDigestJson('{')).toEqual({ headline: null, whatItDoes: null })
    expect(parseShareDigestJson(JSON.stringify({ headline: '  Done  ' }))).toEqual({
      headline: 'Done',
      whatItDoes: null,
    })
  })

  it('prefers digest headline and what-it-does, then CRS, then title', () => {
    const bill = { congress: 119, type: 'HR', number: 4795 }
    expect(
      buildShareCopy({
        headline: 'House passes a permitting package',
        whatItDoes: 'Speeds energy permits.',
        title: 'Official title',
        bill,
      }),
    ).toEqual({
      title: 'House passes a permitting package',
      text: 'Speeds energy permits.',
    })
    expect(
      buildShareCopy({
        crsSummary: 'The official summary explains the first point. A second sentence stays put.',
        title: 'Official title',
        bill,
      }),
    ).toEqual({
      title: 'Official title',
      text: 'The official summary explains the first point.',
    })
  })

  it('builds canonical OG fields on the production origin', () => {
    const bill = { congress: 119, type: 'HR', number: 1 }
    expect(
      buildBillOgFields({ title: 'Energy package', text: 'Speeds permits.' }, bill),
    ).toEqual({
      title: 'Energy package',
      description: 'Speeds permits.',
      url: `${PRODUCTION_ORIGIN}/?bill=119-hr-1`,
    })
  })
})
