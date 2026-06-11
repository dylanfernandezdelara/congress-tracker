import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { FeedItem } from '../api/types'
import { FeedCard } from './FeedCard'

const longDigest =
  'This bill provides a longer generated explanation for readers about funding, oversight, reporting, and assistance programs that should remain fully readable on mobile. '.repeat(
    3,
  )

const longCrsSummary = `Ukraine Support Act

${'This bill provides support to Ukraine and allied countries through security assistance, financing, and oversight. '.repeat(8)}`

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
    policy_area: 'Defense',
    digest: {
      headline: 'Plain headline for readers',
      what_it_does: longDigest,
      key_points: ['Point one'],
      terms_explained: [],
    },
    raw_summary_text: longCrsSummary,
    passage_votes: [
      {
        chamber: 'Senate',
        question: 'On Passage of the Bill',
        result: 'Passed',
        yeas: 52,
        nays: 47,
        date: '2026-06-05',
      },
    ],
    latest_passage_date: '2026-06-05',
    ...overrides,
  }
}

describe('FeedCard', () => {
  it('renders the full digest summary on the front without character truncation', () => {
    const { container } = render(<FeedCard item={makeItem()} />)
    const body = container.querySelector('.flip-card-front p.text-secondary')

    expect(body?.textContent?.trim()).toBe(longDigest.trim())
    expect(body?.textContent?.length ?? 0).toBeGreaterThan(180)
    expect(body?.textContent).not.toMatch(/…$/)
  })

  it('keeps the full official CRS summary on the back', () => {
    const { container } = render(<FeedCard item={makeItem()} />)
    const backSummary = container.querySelector('.flip-card-back .whitespace-pre-wrap')

    expect(backSummary?.textContent).toBe(longCrsSummary)
  })

  it('wraps digest content in the front scroll face structure', () => {
    const { container } = render(<FeedCard item={makeItem()} />)

    const front = container.querySelector('.flip-card-front')
    const content = container.querySelector('.flip-card-front .flip-card-content')
    const surface = container.querySelector('.flip-card-front .feed-card-surface')
    const body = container.querySelector('.flip-card-front p.text-secondary')
    const flipHint = container.querySelector('.flip-card-front .flip-card-flip-hint')

    expect(front).not.toBeNull()
    expect(content).not.toBeNull()
    expect(surface).not.toBeNull()
    expect(flipHint).not.toBeNull()
    expect(body?.textContent?.trim()).toBe(longDigest.trim())
    expect(body?.closest('.flip-card-front')).toBe(front)
    expect(flipHint?.closest('.flip-card-front')).toBe(front)
    expect(content?.contains(surface ?? null)).toBe(true)
    expect(front?.className).toContain('flip-card-face')
  })
})
