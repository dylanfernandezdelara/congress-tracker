import { describe, expect, it } from 'vitest'

import { BILL_CHAT_EXPORT_MAX_CHARS, buildBillChatExportPrompt } from './billChatExport'

const base = {
  shortBillId: 'H.R. 1',
  displayName: 'House passes a broad energy permitting and production package',
  sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1',
  pageUrl: 'https://trackcongress.org/?bill=119-hr-1',
  headline: 'House passes a broad energy permitting and production package',
  whatItDoes: 'It speeds up energy permitting.',
  keyPoints: ['Sets review deadlines', 'Expands leasing'],
  crsSummary: 'CRS: the bill amends NEPA timelines.',
  messages: [] as const,
}

describe('buildBillChatExportPrompt', () => {
  it('builds a briefing that ChatGPT or Claude can continue from', () => {
    const prompt = buildBillChatExportPrompt(base)

    expect(prompt).toContain('Bill: H.R. 1 — House passes a broad energy permitting')
    expect(prompt).toContain('Official text: https://www.congress.gov/bill/119th-congress/house-bill/1')
    expect(prompt).toContain('Track Congress: https://trackcongress.org/?bill=119-hr-1')
    expect(prompt).toContain('Plain-English summary:')
    expect(prompt).toContain('It speeds up energy permitting.')
    expect(prompt).toContain('- Sets review deadlines')
    expect(prompt).toContain('Official CRS summary:')
    expect(prompt).toContain('Start by explaining what this bill does')
    expect(prompt).not.toContain('Conversation so far:')
  })

  it('includes the thread when the reader has already asked questions', () => {
    const prompt = buildBillChatExportPrompt({
      ...base,
      messages: [
        { role: 'user', text: 'How long is the review?' },
        { role: 'assistant', text: 'The Secretary has one year.' },
      ],
    })

    expect(prompt).toContain('Conversation so far:')
    expect(prompt).toContain('User:')
    expect(prompt).toContain('How long is the review?')
    expect(prompt).toContain('Assistant:')
    expect(prompt).toContain('The Secretary has one year.')
    expect(prompt).toContain('Continue this conversation')
    expect(prompt).not.toContain('Start by explaining what this bill does')
  })

  it('caps a long briefing so the ChatGPT URL stays usable', () => {
    const prompt = buildBillChatExportPrompt({
      ...base,
      crsSummary: 'word '.repeat(8_000),
      messages: [{ role: 'user', text: 'Explain every section.' }],
    })

    expect(prompt.length).toBeLessThanOrEqual(BILL_CHAT_EXPORT_MAX_CHARS)
    expect(prompt).toContain('[Briefing truncated.]')
  })
})
