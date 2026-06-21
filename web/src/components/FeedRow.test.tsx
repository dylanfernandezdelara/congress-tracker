import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { congressGovBillUrl } from '../utils/billLabels'
import { makeFeedItem } from '../test/feedItemFixtures'
import { FeedRow } from './FeedRow'

const longCrsSummary = `Ukraine Support Act

${'This bill provides support to Ukraine and allied countries through security assistance, financing, and oversight. '.repeat(4)}`

describe('FeedRow', () => {
  it('shows topic, policy area, digest lead, and bullets without expanding', () => {
    render(<FeedRow item={makeFeedItem()} isExpanded={false} onToggle={() => {}} />)

    expect(screen.getByText('Plain headline for readers')).toBeInTheDocument()
    expect(screen.getByText('Defense')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(
      screen.getByText('It does something important in plain language.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Point one')).toBeInTheDocument()
    expect(screen.queryByText(longCrsSummary)).not.toBeInTheDocument()
    const hiddenEvent = document.querySelector('.feed-row-event[hidden]')
    expect(hiddenEvent?.textContent).toContain('52–47 in the Senate')
  })

  it('includes outcome and margin in the toggle accessible name', () => {
    render(<FeedRow item={makeFeedItem()} isExpanded={false} onToggle={() => {}} />)

    expect(screen.getByRole('button', { name: /Passed/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /52–47/ })).toBeInTheDocument()
  })

  it('shows Failed and margin for a substantive failed vote', () => {
    const item = makeFeedItem({
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Passage of the Bill',
          result: 'Failed',
          yeas: 198,
          nays: 230,
          date: '2026-06-04',
        },
      ],
      latest_passage_date: '2026-06-04',
    })

    render(<FeedRow item={item} isExpanded={false} onToggle={() => {}} />)

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /198–230/ })).toBeInTheDocument()
  })

  it('includes the summary in the toggle accessible description', () => {
    render(<FeedRow item={makeFeedItem()} isExpanded={false} onToggle={() => {}} />)

    const toggle = screen.getByRole('button', { name: /52–47/ })
    const summary = document.querySelector('[data-feed-summary]')
    const describedBy = toggle.getAttribute('aria-describedby')

    expect(describedBy).toBeTruthy()
    expect(summary).toHaveAttribute('id', describedBy)
  })

  it('calls onToggle when the row button is clicked', () => {
    const onToggle = vi.fn()

    render(<FeedRow item={makeFeedItem()} isExpanded={false} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: /52–47/ }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('exposes aria-controls on the collapsed toggle', () => {
    render(<FeedRow item={makeFeedItem()} isExpanded={false} onToggle={() => {}} />)

    const toggle = screen.getByRole('button', { name: /52–47/ })
    const controls = toggle.getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    expect(controls!.length).toBeGreaterThan(0)
  })

  it('toggles on Enter via native button behavior', () => {
    const onToggle = vi.fn()

    render(<FeedRow item={makeFeedItem()} isExpanded={false} onToggle={onToggle} />)

    const toggle = screen.getByRole('button', { name: /52–47/ })
    fireEvent.keyDown(toggle, { key: 'Enter' })

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('shows a truncated CRS summary preview when collapsed without a digest', () => {
    const item = makeFeedItem({
      digest: null,
      raw_summary_text: longCrsSummary,
    })

    render(<FeedRow item={item} isExpanded={false} onToggle={() => {}} />)

    expect(screen.getByText(/This bill provides support to Ukraine/)).toBeInTheDocument()
    expect(screen.queryByText(/Ukraine Support Act/)).not.toBeInTheDocument()
    expect(screen.queryByText(longCrsSummary)).not.toBeInTheDocument()
  })

  it('shows Summary pending when no digest or CRS text is available', () => {
    render(
      <FeedRow
        item={makeFeedItem({ digest: null, raw_summary_text: null })}
        isExpanded={false}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByText('Summary pending')).toBeInTheDocument()
  })

  it('reveals CRS summary text when expanded', () => {
    const item = makeFeedItem({ raw_summary_text: longCrsSummary })
    const { rerender } = render(<FeedRow item={item} isExpanded={false} onToggle={() => {}} />)

    expect(screen.queryByText(/Ukraine Support Act/)).not.toBeInTheDocument()

    rerender(<FeedRow item={item} isExpanded={true} onToggle={() => {}} />)

    expect(screen.getByText(/Ukraine Support Act/)).toBeInTheDocument()
  })

  it('does not toggle expand when the congress.gov link is clicked', () => {
    const onToggle = vi.fn()
    const item = makeFeedItem()

    render(<FeedRow item={item} isExpanded={true} onToggle={onToggle} />)

    const toggle = screen.getByRole('button', { name: /52–47/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const link = screen.getByRole('link', { name: /Read on congress.gov/ })
    expect(link).toHaveAttribute(
      'href',
      congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number),
    )

    fireEvent.click(link)

    expect(onToggle).not.toHaveBeenCalled()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows Procedural on the event line for procedural rows', () => {
    const item = makeFeedItem({
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
    expect(screen.getByText('Procedural')).toBeInTheDocument()
    expect(eventLine?.textContent).toContain('agreed 218–210')
  })
})
