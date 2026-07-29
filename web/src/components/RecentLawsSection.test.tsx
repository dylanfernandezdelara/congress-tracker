import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VOTE_LOOKBACK_DAYS } from '@congress-tracker/shared/feed-constants'

import { clearRollDefectorsCache } from '../api/rollDefectorsCache'
import type { FeedItem, RecentLawItem } from '../api/types'
import { makeFeedItem } from '../test/feedItemFixtures'
import { RecentLawsSection } from './RecentLawsSection'

vi.mock('../api/client', () => ({
  fetchVoteDefectors: vi.fn(),
}))

import { fetchVoteDefectors } from '../api/client'

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

function detailItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return makeFeedItem({
    bill: { congress: 119, type: 'HR', number: 1, title: 'Lower Energy Costs Act' },
    digest: {
      headline: 'House passes a broad energy permitting package',
      what_it_does: 'Speeds up energy permitting in plain language.',
      key_points: ['Shorter permit deadlines'],
      terms_explained: [],
    },
    passage_votes: [
      {
        chamber: 'House',
        congress: 119,
        session: 2,
        roll_number: 9001,
        question: 'On Passage',
        result: 'Passed',
        yeas: 220,
        nays: 213,
        date: '2026-06-05',
      },
    ],
    ...overrides,
  })
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
    item: detailItem(),
    ...overrides,
  }
}

function renderSection(ui: ReactElement) {
  return render(<MemoryRouter future={routerFuture}>{ui}</MemoryRouter>)
}

describe('RecentLawsSection', () => {
  beforeEach(() => {
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'House',
      congress: 119,
      session: 2,
      roll_number: 9001,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: false,
      defectors: [],
      party_splits: [],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    clearRollDefectorsCache()
  })

  it('renders feed-style rows with headline, law meta, bill id, and date', () => {
    const { container } = renderSection(
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
            item: detailItem({
              bill: { congress: 119, type: 'S', number: 47, title: 'Public Lands Protection Act' },
            }),
          }),
        ]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'New laws' })).toBeInTheDocument()
    expect(container.querySelector('.recent-laws-list')).not.toBeNull()

    const firstHeadline = screen.getByRole('heading', {
      name: 'House passes a broad energy permitting package',
    })
    expect(firstHeadline).toHaveClass('feed-row-topic')
    expect(screen.getByText('Signed into law')).toHaveClass('feed-row-badge', 'text-law')
    expect(screen.getByText('Public Law 119-1')).toBeInTheDocument()
    expect(screen.getByLabelText('House bill 1')).toBeInTheDocument()
    expect(screen.getByText('Jul 15')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Public Lands Protection Act' })).toHaveClass(
      'feed-row-topic',
    )
    expect(screen.getByText('Law without signature')).toHaveClass('feed-row-badge', 'text-law')
    expect(screen.getByText('Public Law 119-2')).toBeInTheDocument()
    expect(screen.getByLabelText('Senate bill 47')).toBeInTheDocument()
    expect(screen.getByText('Jul 10')).toBeInTheDocument()

    expect(screen.queryByText(/—/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /congress\.gov/i })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand details for H.R. 1' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands an item and renders FeedRowDetail synchronously from the payload', () => {
    renderSection(<RecentLawsSection laws={[sampleLaw()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))

    expect(screen.getByRole('button', { name: 'Collapse details for H.R. 1' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('heading', { name: 'What it does' })).toBeInTheDocument()
    expect(screen.getByText('Speeds up energy permitting in plain language.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Read on congress\.gov/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/bill/119th-congress/house-bill/1'),
    )
    expect(screen.getByRole('link', { name: 'View in timeline' })).toHaveAttribute(
      'href',
      '/?bill=119-hr-1',
    )
  })

  it('collapses an expanded item and restores detail on re-expand', () => {
    renderSection(<RecentLawsSection laws={[sampleLaw()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(screen.getByRole('heading', { name: 'What it does' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse details for H.R. 1' }))
    expect(screen.queryByRole('heading', { name: 'What it does' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(screen.getByRole('heading', { name: 'What it does' })).toBeInTheDocument()
  })

  it('keeps only one item expanded at a time', () => {
    renderSection(
      <RecentLawsSection
        laws={[
          sampleLaw(),
          sampleLaw({
            bill_type: 'S',
            bill_number: 47,
            headline: 'Public lands headline',
            item: detailItem({
              bill: { congress: 119, type: 'S', number: 47, title: 'Lands' },
              digest: {
                headline: 'Lands detail',
                what_it_does: 'Lands summary body',
                key_points: [],
                terms_explained: [],
              },
            }),
          }),
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(screen.getByText('Speeds up energy permitting in plain language.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for S. 47' }))
    expect(screen.getByText('Lands summary body')).toBeInTheDocument()
    expect(
      screen.queryByText('Speeds up energy permitting in plain language.'),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand details for H.R. 1' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('shows a congress.gov fallback when item is null', () => {
    renderSection(<RecentLawsSection laws={[sampleLaw({ item: null })]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))

    expect(screen.getByText("Couldn't find bill details.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Read on congress\.gov/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/bill/119th-congress/house-bill/1'),
    )
    expect(screen.queryByRole('heading', { name: 'What it does' })).not.toBeInTheDocument()
  })

  it('does not toggle expansion when the congress.gov link is clicked', () => {
    renderSection(<RecentLawsSection laws={[sampleLaw()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    fireEvent.click(screen.getByRole('link', { name: /Read on congress\.gov/i }))
    expect(
      screen.getByRole('button', { name: 'Collapse details for H.R. 1' }),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('omits View in timeline when the passage vote is outside the feed window', () => {
    renderSection(
      <RecentLawsSection
        laws={[sampleLaw({ latest_passage_vote_date: isoDaysAgo(VOTE_LOOKBACK_DAYS + 5) })]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(screen.getByRole('heading', { name: 'What it does' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View in timeline' })).not.toBeInTheDocument()
  })

  it('copies the timeline share URL for in-window laws', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    renderSection(<RecentLawsSection laws={[sampleLaw()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(screen.getByRole('heading', { name: 'What it does' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied).toContain('bill=119-hr-1')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('copies the congress.gov URL for aged-out laws', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    renderSection(
      <RecentLawsSection
        laws={[sampleLaw({ latest_passage_vote_date: isoDaysAgo(VOTE_LOOKBACK_DAYS + 5) })]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(screen.getByRole('heading', { name: 'What it does' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied).toContain('/bill/119th-congress/house-bill/1')
    expect(copied).not.toContain('bill=')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
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

    expect(screen.getByText('Became law')).toHaveClass('feed-row-badge')
    expect(screen.queryByText(/Public Law/)).not.toBeInTheDocument()
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
