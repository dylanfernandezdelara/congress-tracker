import { describe, expect, it } from 'vitest'

import { getExecutiveQuoteText } from './FeedRowExecutiveQuote'

describe('getExecutiveQuoteText', () => {
  it('prefers quote over summary', () => {
    expect(
      getExecutiveQuoteText({
        post_id: '1',
        posted_at: '2026-06-24T00:00:00.000Z',
        summary: 'Short banner',
        quote: 'Full post text here',
        source_url: 'https://example.com',
        informal: true,
      }),
    ).toBe('Full post text here')
  })

  it('falls back to summary when quote is empty', () => {
    expect(
      getExecutiveQuoteText({
        post_id: '1',
        posted_at: '2026-06-24T00:00:00.000Z',
        summary: 'Short banner',
        quote: '',
        source_url: 'https://example.com',
        informal: true,
      }),
    ).toBe('Short banner')
  })
})
