import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FeedItem } from '../api/types'
import { FeedRow } from './FeedRow'

const longCrsSummary = `Ukraine Support Act

${'This bill provides support to Ukraine and allied countries through security assistance, financing, and oversight. '.repeat(4)}`

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
    policy_area: 'Defense',
    digest: {
      headline: 'Plain headline for readers',
      what_it_does: 'It does something important in plain language.',
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

describe('FeedRow', () => {
  it('shows topic and event line without expanding', () => {
    render(<FeedRow item={makeItem()} isExpanded={false} onToggle={() => {}} />)

    expect(screen.getByText('Plain headline for readers')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.queryByText(longCrsSummary)).not.toBeInTheDocument()
  })

  it('includes outcome and margin in the toggle accessible name', () => {
    render(<FeedRow item={makeItem()} isExpanded={false} onToggle={() => {}} />)

    expect(screen.getByRole('button', { name: /52–47/ })).toBeInTheDocument()
  })

  it('reveals CRS summary text when expanded', () => {
    const { rerender } = render(
      <FeedRow item={makeItem()} isExpanded={false} onToggle={() => {}} />,
    )

    expect(screen.queryByText(/Ukraine Support Act/)).not.toBeInTheDocument()

    rerender(<FeedRow item={makeItem()} isExpanded={true} onToggle={() => {}} />)

    expect(screen.getByText(/Ukraine Support Act/)).toBeInTheDocument()
  })

  it('does not toggle expand when the congress.gov link is clicked', () => {
    const onToggle = vi.fn()

    render(<FeedRow item={makeItem()} isExpanded={true} onToggle={onToggle} />)

    const toggle = screen.getByRole('button', { name: /52–47/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('link', { name: /Read on congress.gov/ }))

    expect(onToggle).not.toHaveBeenCalled()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows Procedural on the event line for procedural rows', () => {
    const item = makeItem({
      bill: {
        congress: 119,
        type: 'HRES',
        number: 512,
        title:
          'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.',
      },
      digest: {
        headline: 'Ukraine security assistance',
        what_it_does: 'Sets floor debate terms for the underlying bill.',
        key_points: [],
        terms_explained: [],
      },
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Agreeing to the Resolution',
          result: 'Agreed to',
          yeas: 218,
          nays: 210,
          date: '2026-06-04',
        },
      ],
      latest_passage_date: '2026-06-04',
    })

    const { container } = render(<FeedRow item={item} isExpanded={false} onToggle={() => {}} />)

    const eventLine = container.querySelector('.feed-row-event')
    expect(eventLine?.textContent).toContain('Procedural ·')
  })
})
