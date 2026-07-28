import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { congressGovBillUrl } from '../utils/billLabels'
import { makeFeedItem } from '../test/feedItemFixtures'
import { FeedRow } from './FeedRow'

const longCrsSummary = `Ukraine Support Act

${'This bill provides support to Ukraine and allied countries through security assistance, financing, and oversight. '.repeat(4)}`

describe('FeedRow', () => {
  it('shows topic, policy area, and digest lead without expanding; bullets wait for detail', () => {
    const { container } = render(<FeedRow item={makeFeedItem()} isExpanded={false} onToggle={() => {}} />)

    expect(screen.getByText('Plain headline for readers')).toBeInTheDocument()
    const policyArea = screen.getByText('Defense')
    expect(policyArea).toBeInTheDocument()
    expect(policyArea).toHaveClass('feed-row-policy-area')
    // Policy area sits on its own line below the middot meta chips so wraps
    // never start with a lone separator.
    expect(container.querySelector('.feed-row-meta-row')).not.toContainElement(policyArea)
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toHaveClass('text-pass')
    expect(
      screen.getByText('It does something important in plain language.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Point one')).not.toBeInTheDocument()
    expect(screen.queryByText(longCrsSummary)).not.toBeInTheDocument()
    const hiddenEvent = document.querySelector('.feed-row-event[hidden]')
    expect(hiddenEvent?.textContent).toContain('52–47 in the Senate')
  })

  it('shows digest bullets in the expanded detail panel', () => {
    render(<FeedRow item={makeFeedItem()} isExpanded={true} onToggle={() => {}} />)

    expect(document.querySelector('.feed-row-teaser')).not.toBeInTheDocument()

    const detailPanel = screen.getByRole('region', { name: /Details for Plain headline for readers/ })

    expect(within(detailPanel).getByText('Point one')).toBeInTheDocument()
    expect(within(detailPanel).getByRole('heading', { name: 'Key points' })).toBeInTheDocument()
    expect(within(detailPanel).getByRole('heading', { name: 'What it does' })).toBeInTheDocument()
    expect(
      within(detailPanel).getByText('It does something important in plain language.'),
    ).toBeInTheDocument()
  })

  it('explains Senate bill prefix with an accessible tooltip', () => {
    const { container } = render(<FeedRow item={makeFeedItem()} isExpanded={false} onToggle={() => {}} />)

    const chip = container.querySelector('.feed-row-chip--bill')
    expect(chip).toHaveAttribute('aria-label', 'Senate bill 2')
    const prefix = container.querySelector('abbr.feed-row-bill-prefix')
    expect(prefix).toHaveAttribute('title', 'Senate bill')
    expect(prefix?.textContent).toBe('S.')
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
          congress: 119,
          session: 2,
          roll_number: 1,
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
    expect(screen.getByText('Failed')).toHaveClass('text-fail')
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

  it('shows a short CRS lead when collapsed without a digest', () => {
    const item = makeFeedItem({
      digest: null,
      raw_summary_text: longCrsSummary,
    })

    render(<FeedRow item={item} isExpanded={false} onToggle={() => {}} />)

    expect(screen.queryByText('Plain-English summary coming soon.')).not.toBeInTheDocument()
    const teaser = document.querySelector('.feed-row-teaser')
    expect(teaser?.textContent).toMatch(/This bill provides support/i)
    // Collapsed card uses the first CRS sentence only — not the repeated paragraphs.
    expect(teaser?.textContent?.match(/This bill provides support/g)?.length ?? 0).toBe(1)
  })

  it('shows pending summary copy when no digest or CRS text is available', () => {
    render(
      <FeedRow
        item={makeFeedItem({ digest: null, raw_summary_text: null })}
        isExpanded={false}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByText('Plain-English summary coming soon.')).toBeInTheDocument()
  })

  it('keeps pending summary visible in the detail panel when expanded', () => {
    render(
      <FeedRow
        item={makeFeedItem({ digest: null, raw_summary_text: null })}
        isExpanded={true}
        onToggle={() => {}}
      />,
    )

    expect(document.querySelector('.feed-row-teaser')).not.toBeInTheDocument()
    expect(screen.getByText('Plain-English summary coming soon.')).toBeInTheDocument()
  })

  it('shows a short complete CRS sentence when expanded without a digest and keeps full CRS in disclosure', () => {
    const item = makeFeedItem({ digest: null, raw_summary_text: longCrsSummary })

    render(<FeedRow item={item} isExpanded={true} onToggle={() => {}} />)

    const detailPanel = screen.getByRole('region', { name: /Details for Sample Act/ })
    expect(within(detailPanel).getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    const body = detailPanel.querySelector('.feed-row-detail-section .feed-row-summary-body')
    expect(body).toHaveTextContent(/Ukraine Support Act/)
    expect((body?.textContent ?? '').length).toBeLessThan(longCrsSummary.length)
    expect(body?.textContent?.endsWith('…')).toBe(false)
    const crsDetails = within(detailPanel).getByText('Official CRS summary').closest('details')
    expect(crsDetails).not.toBeNull()
    const scrollable = crsDetails?.querySelector('.feed-row-summary-body--scrollable')
    expect(scrollable).toBeInTheDocument()
    expect(scrollable?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      longCrsSummary.replace(/\s+/g, ' ').trim(),
    )
  })

  it('tucks the official CRS summary behind a disclosure when a digest exists', () => {
    const item = makeFeedItem({ raw_summary_text: longCrsSummary })

    render(<FeedRow item={item} isExpanded={true} onToggle={() => {}} />)

    const detailPanel = screen.getByRole('region', { name: /Details for Plain headline for readers/ })
    const crsDetails = within(detailPanel).getByText('Official CRS summary').closest('details')
    expect(crsDetails).not.toBeNull()
    expect(crsDetails).not.toHaveAttribute('open')
    expect(within(crsDetails as HTMLElement).getByText(/Ukraine Support Act/)).not.toBeVisible()
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
          congress: 119,
          session: 2,
          roll_number: 1,
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

  it('shows LAW — UNSIGNED badge and event line for unsigned enactment', () => {
    const item = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 6644, title: 'Housing Act' },
      passage_votes: [
        {
          chamber: 'Senate',
          congress: 119,
          session: 2,
          roll_number: 1,
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 85,
          nays: 5,
          date: '2026-06-24',
        },
      ],
      latest_passage_date: '2026-06-24',
      lifecycle: {
        introduced_date: '2025-12-11',
        presented_date: '2026-06-29',
        signed_date: null,
        vetoed_date: null,
        became_law_date: '2026-07-11',
        law_kind: 'law_unsigned',
        public_law: 'Public Law 119-42',
        latest_action_date: '2026-07-11',
        latest_action_text: 'Became Public Law without signature.',
        derived: { status: null, day_of_ten: null, deadline_date: null, becomes_law_on: null },
      },
    })

    const { container } = render(<FeedRow item={item} isExpanded={false} onToggle={() => {}} />)

    const badge = screen.getByText('Law — unsigned')
    expect(badge).toHaveClass('feed-row-badge--law_unsigned')
    expect(badge).toHaveClass('text-law')
    const eventLine = container.querySelector('.feed-row-event')
    expect(eventLine).not.toHaveAttribute('hidden')
    expect(eventLine?.textContent).toBe("Became law without the President's signature")
  })

  it('shows a President desk chip while pending signature', () => {
    const item = makeFeedItem({
      lifecycle: {
        introduced_date: '2025-12-11',
        presented_date: '2026-06-29',
        signed_date: null,
        vetoed_date: null,
        became_law_date: null,
        law_kind: null,
        public_law: null,
        latest_action_date: '2026-06-29',
        latest_action_text: 'Presented to President.',
        derived: {
          status: 'pending_signature',
          day_of_ten: 4,
          deadline_date: '2026-07-10',
          becomes_law_on: '2026-07-11',
        },
      },
    })

    render(<FeedRow item={item} isExpanded={false} onToggle={() => {}} />)

    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText("President's desk · day 4/10")).toBeInTheDocument()
  })

  it('shows a direct Truth Social quote when the bill has an executive signal', () => {
    const quote =
      "Today's Housing News Conference and Signing is hereby cancelled until such time as we pass the desperately needed SAVE AMERICA ACT."
    const item = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 6644, title: 'Housing Act' },
      digest: {
        headline: 'Overhauls federal housing programs',
        what_it_does: 'Housing finance reforms.',
        key_points: [],
        terms_explained: [],
      },
      passage_votes: [
        {
          chamber: 'Senate',
          congress: 119,
          session: 2,
          roll_number: 9002,
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 52,
          nays: 47,
          date: '2026-06-24',
        },
      ],
      latest_passage_date: '2026-06-24',
      executive_signals: [
        {
          post_id: '116805545512296111',
          posted_at: '2026-06-24T14:26:00.000Z',
          summary: 'Cancelled housing signing until SAVE Act passes',
          quote,
          source_url: 'https://truthsocial.com/@realDonaldTrump/116805545512296111',
          archive_url: 'https://www.trumpstruth.org/statuses/39514',
          informal: true,
          role: 'primary',
          rationale: 'Post cancels housing signing ceremony',
        },
      ],
      related_executive_bills: [
        {
          congress: 119,
          type: 'HR',
          number: 22,
          title: 'SAVE Act',
          role: 'conditional',
          reason: 'Signing delayed until SAVE America Act passes',
        },
      ],
    })

    render(<FeedRow item={item} isExpanded={false} onToggle={() => {}} />)

    expect(screen.getByText(/About this bill/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Overhauls federal housing programs' })).toHaveAttribute(
      'href',
      congressGovBillUrl(119, 'HR', 6644),
    )
    expect(screen.getByText(/Post cancels housing signing ceremony/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'SAVE Act' })).toHaveAttribute(
      'href',
      congressGovBillUrl(119, 'HR', 22),
    )
    expect(screen.getByText(/Donald Trump · Truth Social/)).toBeInTheDocument()
    expect(screen.getByText(/Trump post/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Overhauls federal housing programs' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View post' })).toHaveAttribute(
      'href',
      'https://truthsocial.com/@realDonaldTrump/116805545512296111',
    )
  })
})
