import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { VOTE_LOOKBACK_DAYS } from '@congress-tracker/shared/feed-constants'
import { daysAgoLookbackStartIso } from '@congress-tracker/shared/lookback'

import type { RecentLawItem } from '../api/types'
import { RecentLawsSection } from './RecentLawsSection'

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function sampleLaw(overrides: Partial<RecentLawItem> = {}): RecentLawItem {
  return {
    congress: 119,
    bill_type: 'HR',
    bill_number: 1,
    title: 'Lower Energy Costs Act',
    policy_area: 'Energy',
    headline: 'House passes a broad energy permitting package',
    became_law_date: '2026-07-15',
    law_kind: 'signed',
    public_law: '119-1',
    signed_date: '2026-07-15',
    presented_date: '2026-07-10',
    latest_action_date: '2026-07-15',
    latest_action_text: 'Became Public Law No: 119-1.',
    latest_passage_vote_date: isoDaysAgo(3),
    ...overrides,
  }
}

function renderSection(ui: ReactElement) {
  return render(<MemoryRouter future={routerFuture}>{ui}</MemoryRouter>)
}

describe('RecentLawsSection', () => {
  it('renders bill id, outcome copy, public law, and enactment date', () => {
    renderSection(
      <RecentLawsSection
        laws={[
          sampleLaw(),
          sampleLaw({
            bill_type: 'S',
            bill_number: 47,
            headline: null,
            title: 'Public Lands Protection Act',
            law_kind: 'law_unsigned',
            public_law: '119-2',
            became_law_date: '2026-07-10',
            signed_date: null,
          }),
        ]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'New laws' })).toBeInTheDocument()
    expect(screen.getByText('H.R. 1')).toBeInTheDocument()
    expect(screen.getByText('House passes a broad energy permitting package')).toBeInTheDocument()
    expect(screen.getByText(/Signed into law · Public Law 119-1 · Jul 15/)).toBeInTheDocument()
    expect(screen.getByText('S. 47')).toBeInTheDocument()
    expect(screen.getByText('Public Lands Protection Act')).toBeInTheDocument()
    expect(screen.getByText(/Became law — unsigned · Public Law 119-2 · Jul 10/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open H.R. 1 in the feed' })).toHaveAttribute(
      'href',
      '/?bill=119-hr-1',
    )
    expect(screen.getAllByRole('link', { name: /congress\.gov/i })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/bill/119th-congress/house-bill/1'),
    )
  })

  it('deep-links to the feed when the passage vote is still in the lookback window', () => {
    const recentVote = daysAgoLookbackStartIso(VOTE_LOOKBACK_DAYS)
    renderSection(
      <RecentLawsSection laws={[sampleLaw({ latest_passage_vote_date: recentVote })]} />,
    )

    expect(screen.getByRole('link', { name: 'Open H.R. 1 in the feed' })).toHaveAttribute(
      'href',
      '/?bill=119-hr-1',
    )
    expect(screen.getByRole('link', { name: /congress\.gov/i })).toBeInTheDocument()
  })

  it('uses congress.gov as the primary link when the passage vote is outside the feed window', () => {
    renderSection(
      <RecentLawsSection
        laws={[sampleLaw({ latest_passage_vote_date: isoDaysAgo(VOTE_LOOKBACK_DAYS + 5) })]}
      />,
    )

    expect(screen.queryByRole('link', { name: 'Open H.R. 1 in the feed' })).not.toBeInTheDocument()
    const primary = screen.getByRole('link', { name: 'Read H.R. 1 on congress.gov' })
    expect(primary).toHaveAttribute(
      'href',
      expect.stringContaining('/bill/119th-congress/house-bill/1'),
    )
    expect(screen.queryByRole('link', { name: /^congress\.gov/i })).not.toBeInTheDocument()
  })

  it('uses congress.gov as the primary link when no passage vote date is recorded', () => {
    renderSection(
      <RecentLawsSection laws={[sampleLaw({ latest_passage_vote_date: null })]} />,
    )

    expect(screen.queryByRole('link', { name: 'Open H.R. 1 in the feed' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Read H.R. 1 on congress.gov' })).toBeInTheDocument()
  })

  it('falls back to Became law when law_kind is null', () => {
    renderSection(
      <RecentLawsSection
        laws={[
          sampleLaw({
            law_kind: null,
            public_law: null,
          }),
        ]}
      />,
    )

    expect(screen.getByText(/Became law · Jul 15/)).toBeInTheDocument()
  })

  it('renders nothing when there are no laws', () => {
    const { container } = renderSection(<RecentLawsSection laws={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows error and retry', () => {
    const onRetry = vi.fn()
    renderSection(
      <RecentLawsSection laws={null} error="Couldn't load new laws." onRetry={onRetry} />,
    )

    expect(screen.getByText("Couldn't load new laws.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows a quiet loading state', () => {
    renderSection(<RecentLawsSection laws={null} loading />)
    expect(screen.getByText('Loading new laws…')).toBeInTheDocument()
  })
})
