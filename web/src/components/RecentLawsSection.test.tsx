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
            item: detailItem({
              bill: { congress: 119, type: 'S', number: 47, title: 'Public Lands Protection Act' },
            }),
          }),
        ]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'New laws' })).toBeInTheDocument()
    const firstBillId = screen.getByText('H.R. 1')
    const firstHeadline = screen.getByText('House passes a broad energy permitting package')
    expect(firstBillId).toHaveClass('recent-laws-bill-id')
    expect(firstHeadline).toHaveClass('recent-laws-headline')
    expect(firstBillId.compareDocumentPosition(firstHeadline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/H\.R\. 1\s*—/)).not.toBeInTheDocument()
    expect(screen.getByText(/Signed into law · Public Law 119-1 · Jul 15/)).toBeInTheDocument()
    expect(screen.getByText('S. 47')).toHaveClass('recent-laws-bill-id')
    expect(screen.getByText('Public Lands Protection Act')).toHaveClass('recent-laws-headline')
    expect(screen.getByText(/Became law — unsigned · Public Law 119-2 · Jul 10/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand details for H.R. 1' }),
    ).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('link', { name: /congress\.gov/i })[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/bill/119th-congress/house-bill/1'),
    )
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

    fireEvent.click(screen.getByRole('link', { name: /congress\.gov/i }))
    expect(
      screen.getByRole('button', { name: 'Expand details for H.R. 1' }),
    ).toHaveAttribute('aria-expanded', 'false')
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
