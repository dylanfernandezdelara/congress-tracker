import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VOTE_LOOKBACK_DAYS } from '@congress-tracker/shared/feed-constants'

import { clearRollDefectorsCache } from '../api/rollDefectorsCache'
import type { RecentLawItem } from '../api/types'
import { makeFeedItem } from '../test/feedItemFixtures'
import { RecentLawsSection } from './RecentLawsSection'

vi.mock('../api/client', () => ({
  fetchFeedBill: vi.fn(),
  fetchVoteDefectors: vi.fn(),
}))

import { fetchFeedBill, fetchVoteDefectors } from '../api/client'

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
    vi.mocked(fetchFeedBill).mockResolvedValue({
      item: makeFeedItem({
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
      }),
      as_of: '2026-07-28T00:00:00.000Z',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    clearRollDefectorsCache()
  })

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
    expect(
      screen.getByRole('button', { name: 'Expand details for H.R. 1' }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('link', { name: /congress\.gov/i })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/bill/119th-congress/house-bill/1'),
    )
  })

  it('expands an item, fetches bill details, and renders FeedRowDetail content', async () => {
    renderSection(<RecentLawsSection laws={[sampleLaw()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))

    expect(screen.getByRole('button', { name: 'Collapse details for H.R. 1' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(await screen.findByRole('heading', { name: 'What it does' })).toBeInTheDocument()
    expect(
      screen.getByText('Speeds up energy permitting in plain language.'),
    ).toBeInTheDocument()
    expect(fetchFeedBill).toHaveBeenCalledWith({
      congress: 119,
      type: 'HR',
      number: 1,
    })
    expect(screen.getByRole('link', { name: 'View in timeline' })).toHaveAttribute(
      'href',
      '/?bill=119-hr-1',
    )
  })

  it('collapses an expanded item and does not refetch on re-expand', async () => {
    renderSection(<RecentLawsSection laws={[sampleLaw()]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(await screen.findByRole('heading', { name: 'What it does' })).toBeInTheDocument()
    expect(fetchFeedBill).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse details for H.R. 1' }))
    expect(screen.queryByRole('heading', { name: 'What it does' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(await screen.findByRole('heading', { name: 'What it does' })).toBeInTheDocument()
    expect(fetchFeedBill).toHaveBeenCalledTimes(1)
  })

  it('keeps only one item expanded at a time', async () => {
    vi.mocked(fetchFeedBill).mockImplementation(async ({ number }) => ({
      item: makeFeedItem({
        bill: {
          congress: 119,
          type: number === 1 ? 'HR' : 'S',
          number,
          title: number === 1 ? 'Energy' : 'Lands',
        },
        digest: {
          headline: number === 1 ? 'Energy detail' : 'Lands detail',
          what_it_does: number === 1 ? 'Energy summary body' : 'Lands summary body',
          key_points: [],
          terms_explained: [],
        },
      }),
      as_of: '2026-07-28T00:00:00.000Z',
    }))

    renderSection(
      <RecentLawsSection
        laws={[
          sampleLaw(),
          sampleLaw({
            bill_type: 'S',
            bill_number: 47,
            headline: 'Public lands headline',
          }),
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(await screen.findByText('Energy summary body')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for S. 47' }))
    expect(await screen.findByText('Lands summary body')).toBeInTheDocument()
    expect(screen.queryByText('Energy summary body')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand details for H.R. 1' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('shows an error with retry when the bill fetch fails', async () => {
    vi.mocked(fetchFeedBill)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        item: makeFeedItem({
          bill: { congress: 119, type: 'HR', number: 1, title: 'Lower Energy Costs Act' },
          digest: {
            headline: 'Recovered',
            what_it_does: 'Recovered summary body',
            key_points: [],
            terms_explained: [],
          },
        }),
        as_of: '2026-07-28T00:00:00.000Z',
      })

    renderSection(<RecentLawsSection laws={[sampleLaw()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))

    expect(await screen.findByText("Couldn't load bill details.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Recovered summary body')).toBeInTheDocument()
    expect(fetchFeedBill).toHaveBeenCalledTimes(2)
  })

  it('does not toggle expansion when the congress.gov link is clicked', async () => {
    renderSection(<RecentLawsSection laws={[sampleLaw()]} />)

    fireEvent.click(screen.getByRole('link', { name: /congress\.gov/i }))
    expect(fetchFeedBill).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Expand details for H.R. 1' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('omits View in timeline when the passage vote is outside the feed window', async () => {
    renderSection(
      <RecentLawsSection
        laws={[sampleLaw({ latest_passage_vote_date: isoDaysAgo(VOTE_LOOKBACK_DAYS + 5) })]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand details for H.R. 1' }))
    expect(await screen.findByRole('heading', { name: 'What it does' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View in timeline' })).not.toBeInTheDocument()
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
