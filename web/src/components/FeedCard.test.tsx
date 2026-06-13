import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { FeedItem } from '../api/types'
import { SUMMARY_PREVIEW_MAX_CHARS } from '../utils/billLabels'
import { FeedCard } from './FeedCard'

const longDigest =
  'This bill provides a longer generated explanation for readers about funding, oversight, reporting, and assistance programs that should remain fully readable on mobile. '.repeat(
    5,
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
  it('caps the digest summary on the front with a word-boundary ellipsis', () => {
    const { container } = render(<FeedCard item={makeItem()} />)
    const body = container.querySelector('.flip-card-front p.text-secondary')
    const text = body?.textContent?.trim() ?? ''

    expect(text.length).toBeLessThanOrEqual(SUMMARY_PREVIEW_MAX_CHARS)
    expect(text).toMatch(/…$/)
    expect(text).not.toBe(longDigest.trim())
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
    const text = body?.textContent?.trim() ?? ''
    expect(text.length).toBeGreaterThan(0)
    expect(text.length).toBeLessThanOrEqual(SUMMARY_PREVIEW_MAX_CHARS)
    expect(text).toMatch(/…$/)
    expect(body?.closest('.flip-card-front')).toBe(front)
    expect(flipHint?.closest('.flip-card-front')).toBe(front)
    expect(content?.contains(surface ?? null)).toBe(true)
    expect(front?.className).toContain('flip-card-face')
  })

  it('shows a Did not pass pill when all passage votes failed', () => {
    const { container } = render(
      <FeedCard
        item={makeItem({
          passage_votes: [
            {
              chamber: 'Senate',
              question: 'On Passage of the Bill',
              result: 'Failed',
              yeas: 40,
              nays: 55,
              date: '2026-06-05',
            },
          ],
        })}
      />,
    )

    expect(container.textContent).toContain('Did not pass')
  })

  it('does not show a Did not pass pill when a passage vote passed', () => {
    const { container } = render(<FeedCard item={makeItem()} />)

    expect(container.textContent).not.toContain('Did not pass')
  })

  it('shows the bill docket on the back face', () => {
    const { container } = render(
      <FeedCard
        item={makeItem({
          bill: { congress: 119, type: 'HR', number: 8428, title: 'Sample Act' },
        })}
      />,
    )

    const back = container.querySelector('.flip-card-back')
    expect(back?.textContent).toContain('H.R. 8428 · 119th Congress')
  })

  it('shows the congress.gov link on the front face', () => {
    const { container } = render(<FeedCard item={makeItem()} />)

    const frontLink = container.querySelector('.flip-card-front .congress-link')
    const backLink = container.querySelector('.flip-card-back .congress-link')

    expect(frontLink).not.toBeNull()
    expect(frontLink).toHaveAttribute(
      'href',
      'https://www.congress.gov/bill/119th-congress/senate-bill/2',
    )
    expect(backLink).toBeNull()
  })

  it('caps the raw summary fallback on the front while keeping the full text on the back', () => {
    const { container } = render(
      <FeedCard
        item={makeItem({
          digest: null,
        })}
      />,
    )
    const body = container.querySelector('.flip-card-front p.text-secondary')
    const backSummary = container.querySelector('.flip-card-back .whitespace-pre-wrap')
    const text = body?.textContent?.trim() ?? ''

    expect(text.length).toBeLessThanOrEqual(SUMMARY_PREVIEW_MAX_CHARS)
    expect(text).toMatch(/…$/)
    expect(backSummary?.textContent).toBe(longCrsSummary)
  })
})
