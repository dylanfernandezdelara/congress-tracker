import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FeedPassageVote } from '../api/types'
import { clearMemberProfileCache } from '../api/memberProfileCache'
import { clearRollDefectorsCache } from '../api/rollDefectorsCache'
import { makeFeedItem } from '../test/feedItemFixtures'
import { resetSheetLayerForTests } from '../utils/sheetLayer'
import { FeedRowDetail } from './FeedRowDetail'

vi.mock('../api/client', () => ({
  fetchVoteDefectors: vi.fn(),
  fetchMemberProfile: vi.fn(),
  fetchBillQuote: vi.fn(),
  createBillQuote: vi.fn(),
}))

const chatMock: {
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    parts: Array<
      | { type: 'text'; text: string }
      | {
          type: 'data-answer'
          data: { text: string; sig: string | null; unverified_quotes: number; refused: boolean }
        }
    >
  }>
  status: 'ready'
  error: undefined
  sendMessage: ReturnType<typeof vi.fn>
  regenerate: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
} = {
  messages: [],
  status: 'ready',
  error: undefined,
  sendMessage: vi.fn(),
  regenerate: vi.fn(),
  stop: vi.fn(),
}

vi.mock('@ai-sdk/react', () => ({
  useChat: () => chatMock,
}))

import { createBillQuote, fetchBillQuote, fetchMemberProfile, fetchVoteDefectors } from '../api/client'
import { ApiError } from '../api/fetchJson'
import { renderWithMemberProfile } from '../test/memberProfileHarness'

beforeEach(() => {
  // Tests that are not about defectors still render the vote section.
  vi.mocked(fetchVoteDefectors).mockResolvedValue({
    chamber: 'Senate',
    congress: 119,
    session: 2,
    roll_number: 9002,
    as_of: '2026-06-05T00:00:00.000Z',
    member_votes_available: false,
    defectors: [],
    party_splits: [],
  })
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  chatMock.messages = []
  clearMemberProfileCache()
  clearRollDefectorsCache()
  resetSheetLayerForTests()
})

describe('FeedRowDetail', () => {
  it('shows party defectors for an expanded vote when member data exists', async () => {
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: true,
      defectors: [
        {
          bioguide_id: 'LOCAL:S001',
          name: 'Sen. Sample Crossover (local)',
          party: 'R',
          state: 'TX',
          position: 'nay',
          party_line: 'yea',
          congress_gov_url: 'https://www.congress.gov/member/local:s001',
        },
      ],
      party_splits: [
        { party: 'R', yeas: 52, nays: 1, party_line: 'yea' },
        { party: 'D', yeas: 0, nays: 46, party_line: 'nay' },
      ],
    })

    renderWithMemberProfile(<FeedRowDetail item={makeFeedItem()} />)

    await waitFor(() => {
      expect(screen.getByText('Sen. Sample Crossover (local)')).toBeInTheDocument()
    })
    // The proportion is what keeps a lone crossover from reading as a party split.
    expect(
      screen.getByText('1 of 53 Republicans voted Nay — the caucus voted Yea.'),
    ).toBeInTheDocument()
    expect(screen.getByText('R 52–1 · D 0–46')).toBeInTheDocument()
  })

  it('shows the full digest summary and key points in the detail panel', () => {
    render(<FeedRowDetail item={makeFeedItem()} />)

    expect(screen.getByRole('heading', { name: 'What it does' })).toBeInTheDocument()
    expect(
      screen.getByText('It does something important in plain language.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Key points' })).toBeInTheDocument()
    expect(screen.getByText('Point one')).toBeInTheDocument()
    expect(screen.getByText('Official CRS summary')).toBeInTheDocument()
  })

  it('shows a short complete CRS sentence when no digest exists and keeps the full CRS in disclosure', () => {
    const crs =
      'This concurrent resolution directs the President to remove U.S. Armed Forces from hostilities against Iran or any part of its government or military unless a declaration of war or specific statutory authorization has been enacted. Congress retains the power to authorize force.'
    render(
      <FeedRowDetail
        item={makeFeedItem({ digest: null, raw_summary_text: crs })}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    const body = document.querySelector('.feed-row-detail-section .feed-row-summary-body')
    expect(body).toHaveTextContent(
      'This concurrent resolution directs the President to remove U.S. Armed Forces from hostilities against Iran or any part of its government or military unless a declaration of war or specific statutory authorization has been enacted.',
    )
    expect(body?.textContent?.endsWith('…')).toBe(false)
    expect(screen.getByText('Official CRS summary')).toBeInTheDocument()
    const crsDetails = screen.getByText('Official CRS summary').closest('details')
    expect(crsDetails).toBeTruthy()
    expect(crsDetails?.querySelector('.feed-row-summary-body--scrollable')).toBeInTheDocument()
    expect(crsDetails).toHaveTextContent(crs)
  })

  it('shows CRS only in the disclosure when digest key points exist without a lead', () => {
    render(
      <FeedRowDetail
        item={makeFeedItem({
          digest: {
            headline: 'Plain headline for readers',
            what_it_does: '   ',
            key_points: ['Point one'],
            terms_explained: [],
          },
          raw_summary_text: 'Official CRS summary text.',
        })}
      />,
    )

    expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument()
    expect(screen.getByText('Official CRS summary')).toBeInTheDocument()
    expect(screen.getAllByText('Official CRS summary text.')).toHaveLength(1)
  })

  it('shows an empty state when no members broke with their party', async () => {
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: true,
      defectors: [],
      party_splits: [],
    })

    render(<FeedRowDetail item={makeFeedItem()} />)

    await waitFor(() => {
      expect(screen.getByText(/No members broke with their party/)).toBeInTheDocument()
    })
  })

  it('shows unavailable copy when member votes were not ingested', async () => {
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: false,
      defectors: [],
      party_splits: [],
    })

    render(<FeedRowDetail item={makeFeedItem()} />)

    await waitFor(() => {
      expect(screen.getByText('Member-level votes not available yet.')).toBeInTheDocument()
    })
  })

  it('shows unavailable copy when roll call keys are missing', () => {
    // Incomplete vote (defensive path in voteRollKey) — cast past the required-field type.
    const incompleteVote = {
      chamber: 'Senate',
      question: 'On Passage of the Bill',
      result: 'Passed',
      yeas: 52,
      nays: 47,
      date: '2026-06-05',
    } as FeedPassageVote

    render(
      <FeedRowDetail
        item={makeFeedItem({
          passage_votes: [incompleteVote],
        })}
      />,
    )

    expect(screen.getByText('Member-level votes not available yet.')).toBeInTheDocument()
  })

  it('collapses a long single-party defector list behind a toggle', async () => {
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: true,
      defectors: Array.from({ length: 13 }, (_, i) => ({
        bioguide_id: `D00${i}`,
        name: `Rep. Crossover ${i}`,
        party: 'D',
        state: 'CA',
        position: 'yea' as const,
        party_line: 'nay' as const,
        congress_gov_url: `https://www.congress.gov/member/d00${i}`,
      })),
      party_splits: [
        { party: 'R', yeas: 218, nays: 0, party_line: 'yea' },
        { party: 'D', yeas: 13, nays: 198, party_line: 'nay' },
      ],
    })

    renderWithMemberProfile(<FeedRowDetail item={makeFeedItem()} />)

    const toggle = await screen.findByRole('button', { name: 'Show all 13' })
    expect(screen.getAllByText(/Rep. Crossover/)).toHaveLength(6)
    expect(
      screen.getByText('13 of 211 Democrats voted Yea — the caucus voted Nay.'),
    ).toBeInTheDocument()

    fireEvent.click(toggle)

    expect(screen.getAllByText(/Rep. Crossover/)).toHaveLength(13)
    expect(screen.getByRole('button', { name: 'Show fewer' })).toBeInTheDocument()
  })

  it('flags provisions added after the summarized bill version', async () => {
    render(
      <FeedRowDetail
        item={makeFeedItem({
          text_changes: {
            summary_version: 'Reported in House',
            summary_version_date: '2026-02-03',
            latest_version: 'Engrossed in House',
            latest_version_date: '2026-07-22',
            added_provisions: [
              { label: '3.', heading: 'Requiring voters to provide photo identification' },
            ],
            more_added_count: 0,
          },
        })}
      />,
    )

    expect(screen.getByText('Added after this summary')).toBeInTheDocument()
    expect(
      screen.getByText('Requiring voters to provide photo identification'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Member-level votes not available yet.')).toBeInTheDocument()
    })
  })

  it('lists companion floor votes alongside the passage vote', async () => {
    render(
      <FeedRowDetail
        item={makeFeedItem({
          companion_votes: [
            {
              chamber: 'House',
              congress: 119,
              session: 2,
              roll_number: 279,
              question: 'On Motion to Recommit',
              result: 'Failed',
              yeas: 211,
              nays: 218,
              date: '2026-07-22',
            },
          ],
        })}
      />,
    )

    expect(screen.getByText('On Motion to Recommit')).toBeInTheDocument()
    expect(screen.getByText(/Failed · 211–218/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Member-level votes not available yet.')).toBeInTheDocument()
    })
  })

  it('copies paste-ready share text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.mocked(fetchVoteDefectors).mockResolvedValue({
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      as_of: '2026-06-05T00:00:00.000Z',
      member_votes_available: false,
      defectors: [],
      party_splits: [],
    })

    render(<FeedRowDetail item={makeFeedItem()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share this bill' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied).toContain('Plain headline for readers')
    expect(copied).toContain('It does something important in plain language.')
    expect(copied).toContain('bill=119-s-2')
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('copies an explicit shareUrl inside paste-ready text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    render(
      <FeedRowDetail
        item={makeFeedItem()}
        shareUrl="https://www.congress.gov/bill/119th-congress/senate-bill/2"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share this bill' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied).toContain('https://www.congress.gov/bill/119th-congress/senate-bill/2')
    expect(copied).toContain('Plain headline for readers')
    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('opens a share sheet that previews title, body, and URL', async () => {
    render(<FeedRowDetail item={makeFeedItem()} />)

    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Share' }).parentElement).toHaveClass('feed-row-detail-topbar')
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share this bill' })
    expect(dialog).toHaveTextContent('Plain headline for readers')
    expect(dialog).toHaveTextContent('It does something important in plain language.')
    expect(dialog).toHaveTextContent('bill=119-s-2')
    expect(within(dialog).getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
  })

  it('portals the share sheet to document.body so a transformed ancestor cannot trap it', async () => {
    render(
      <div className="feed-row-detail-panel" style={{ transform: 'translateY(0)' }}>
        <FeedRowDetail item={makeFeedItem()} />
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share this bill' })
    const root = dialog.closest('.sheet-root')
    expect(root).not.toBeNull()
    expect(root?.parentElement).toBe(document.body)
    expect(root?.closest('.feed-row-detail-panel')).toBeNull()
  })

  it('shares via navigator.share from the preview sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } })

    render(<FeedRowDetail item={makeFeedItem()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share this bill' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Share' }))

    await waitFor(() => {
      expect(share).toHaveBeenCalled()
    })
    expect(share.mock.calls[0]?.[0]).toMatchObject({
      title: 'Plain headline for readers',
      text: 'It does something important in plain language.',
    })
    expect(String((share.mock.calls[0]?.[0] as { url?: string }).url)).toContain('bill=119-s-2')
  })

  it('shows the primary sponsor above the fold when the payload has one', async () => {
    renderWithMemberProfile(
      <FeedRowDetail
        item={makeFeedItem({
          primary_sponsor: {
            bioguide_id: 'LOCAL:H002',
            name: 'Rep. Sample Loyal (local)',
            party: 'D',
            state: 'NY',
          },
        })}
      />,
    )

    expect(screen.getByText(/Sponsored by/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open profile for Rep. Sample Loyal (local)' })).toBeInTheDocument()
    expect(document.querySelector('.feed-row-sponsor')).toHaveTextContent(
      'Sponsored by Rep. Sample Loyal (local) · D-NY',
    )
    const shareButton = screen.getByRole('button', { name: 'Share' })
    const sponsor = document.querySelector('.feed-row-sponsor')
    expect(shareButton.parentElement).toBe(sponsor?.parentElement)
    expect(shareButton.parentElement).toHaveClass('feed-row-detail-topbar')
    await waitFor(() => {
      expect(screen.getByText('Member-level votes not available yet.')).toBeInTheDocument()
    })
  })

  it('opens the member profile when the sponsor name is clicked', async () => {
    vi.mocked(fetchMemberProfile).mockResolvedValue({
      bioguide_id: 'LOCAL:H002',
      name: 'Rep. Sample Loyal (local)',
      chamber: 'House',
      party: 'D',
      state: 'NY',
      district: 10,
      photo_url: '',
      congress_gov_url: null,
      congress: 119,
      session: 2,
      votes_cast: 8,
      yea_count: 6,
      nay_count: 2,
      cross_vote_count: 0,
      cross_vote_label: 'rare',
      recent_cross_votes: [],
      sponsored_bills: [],
      sponsored_bills_total: 0,
      member_votes_available: true,
      as_of: '2026-07-20T00:00:00.000Z',
    })

    renderWithMemberProfile(
      <FeedRowDetail
        item={makeFeedItem({
          primary_sponsor: {
            bioguide_id: 'LOCAL:H002',
            name: 'Rep. Sample Loyal (local)',
            party: 'D',
            state: 'NY',
          },
        })}
      />,
    )

    const nameButton = screen.getByRole('button', {
      name: 'Open profile for Rep. Sample Loyal (local)',
    })
    fireEvent.mouseEnter(nameButton)
    fireEvent.click(nameButton)

    expect(screen.getByRole('dialog', { name: 'Rep. Sample Loyal (local)' })).toBeInTheDocument()
    await waitFor(() => {
      expect(fetchMemberProfile).toHaveBeenCalledWith('LOCAL:H002')
      expect(screen.getByText('NY-10')).toBeInTheDocument()
    })
  })

  it('does not make LIS: placeholder sponsor names interactive', async () => {
    renderWithMemberProfile(
      <FeedRowDetail
        item={makeFeedItem({
          primary_sponsor: {
            bioguide_id: 'LIS:S123',
            name: 'Sen. Placeholder',
            party: 'R',
            state: 'TX',
          },
        })}
      />,
    )

    expect(screen.queryByRole('button', { name: /Open profile/ })).not.toBeInTheDocument()
    expect(document.querySelector('.feed-row-sponsor')).toHaveTextContent(
      'Sponsored by Sen. Placeholder · R-TX',
    )
    await waitFor(() => {
      expect(screen.getByText('Member-level votes not available yet.')).toBeInTheDocument()
    })
  })

  it('renders the share-card preview for the whole bill', async () => {
    render(<FeedRowDetail item={makeFeedItem()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    const dialog = await screen.findByRole('dialog', { name: 'Share this bill' })
    const card = within(dialog).getByTestId('og-card-preview')
    expect(card).toHaveTextContent('S. 2 · 119th Congress')
    expect(card).toHaveTextContent('Plain headline for readers')
    expect(card).toHaveTextContent('Passed Senate 52–47 · Jun 5, 2026')
    expect(card).toHaveTextContent('Yea 52')
  })

  it('marks summary text as quotable regions', () => {
    render(<FeedRowDetail item={makeFeedItem()} />)
    const quotable = document.querySelectorAll('[data-quotable]')
    expect(quotable.length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('It does something important in plain language.')).toHaveAttribute(
      'data-quotable',
      'digest',
    )
  })

  it('highlights a shared quote in place, scrolls to it, and toasts', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    vi.mocked(fetchBillQuote).mockResolvedValue({
      quote: {
        id: 'abc123abc123abc1',
        bill: { congress: 119, type: 'S', number: 2 },
        text: 'something important',
        source: 'digest',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    })

    render(<FeedRowDetail item={makeFeedItem()} quoteId="abc123abc123abc1" />)

    const mark = await screen.findByText('something important', { selector: 'mark' })
    expect(mark).toHaveClass('quote-highlight', 'quote-highlight--landing')
    expect(await screen.findByRole('status')).toHaveTextContent('Shared quote')
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalled()
    })
    expect(screen.queryByLabelText('Shared quote')).not.toBeInTheDocument()
  })

  it('opens the CRS disclosure when the shared quote lives there', async () => {
    vi.mocked(fetchBillQuote).mockResolvedValue({
      quote: {
        id: 'abc123abc123abc2',
        bill: { congress: 119, type: 'S', number: 2 },
        text: 'Official CRS summary text.',
        source: 'crs',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    })

    render(<FeedRowDetail item={makeFeedItem()} quoteId="abc123abc123abc2" />)

    await screen.findByText('Official CRS summary text.', { selector: 'mark' })
    expect(document.querySelector('details.feed-row-crs-details')).toHaveAttribute('open')
  })

  it('falls back to a callout when the shared quote no longer matches the summary', async () => {
    vi.mocked(fetchBillQuote).mockResolvedValue({
      quote: {
        id: 'abc123abc123abc3',
        bill: { congress: 119, type: 'S', number: 2 },
        text: 'Text that was rewritten since sharing.',
        source: 'digest',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    })

    render(<FeedRowDetail item={makeFeedItem()} quoteId="abc123abc123abc3" />)

    const callout = await screen.findByLabelText('Shared quote')
    expect(callout).toHaveTextContent('“Text that was rewritten since sharing.”')
    expect(document.querySelector('mark[data-quote-highlight]')).toBeNull()
  })

  it('ignores a shared quote stored for a different bill', async () => {
    vi.mocked(fetchBillQuote).mockResolvedValue({
      quote: {
        id: 'abc123abc123abc4',
        bill: { congress: 119, type: 'HR', number: 1 },
        text: 'something important',
        source: 'digest',
        created_at: '2026-09-01T00:00:00.000Z',
      },
    })

    render(<FeedRowDetail item={makeFeedItem()} quoteId="abc123abc123abc4" />)

    await waitFor(() => {
      expect(fetchBillQuote).toHaveBeenCalledWith('abc123abc123abc4')
    })
    expect(document.querySelector('mark[data-quote-highlight]')).toBeNull()
    expect(screen.queryByLabelText('Shared quote')).not.toBeInTheDocument()
  })

  function selectQuotableText(text: string) {
    const paragraph = screen.getByText(text)
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    ;(range as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
      new DOMRect(100, 200, 160, 18)
    vi.spyOn(window, 'getSelection').mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => text,
      removeAllRanges: vi.fn(),
    } as unknown as Selection)
    fireEvent(document, new Event('selectionchange'))
  }

  it('shares a selected passage: verifies it, then opens the sheet with the quote card', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(createBillQuote).mockResolvedValue({
      quote: {
        id: 'feedfacefeedface',
        bill: { congress: 119, type: 'S', number: 2 },
        text: 'It does something important in plain language.',
        source: 'digest',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      url: 'https://trackcongress.org/?bill=119-s-2&quote=feedfacefeedface',
    })
    render(<FeedRowDetail item={makeFeedItem()} />)

    selectQuotableText('It does something important in plain language.')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    const toolbar = await screen.findByRole('toolbar', { name: 'Selected text actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Share quote' }))

    await waitFor(() => {
      expect(createBillQuote).toHaveBeenCalledWith({
        bill: '119-s-2',
        text: 'It does something important in plain language.',
      })
    })
    const dialog = await screen.findByRole('dialog', { name: 'Share this quote' })
    const card = within(dialog).getByTestId('og-card-preview')
    expect(card).toHaveTextContent('It does something important in plain language.')
    expect(within(dialog).getByText(/quote=feedfacefeedface/)).toBeInTheDocument()
    expect(within(dialog).getByText('“It does something important in plain language.”')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('surfaces the API validation message when a selection cannot be shared', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(createBillQuote).mockRejectedValue(
      new ApiError(
        "That text is not part of this bill's summary, so it cannot be shared as a quote.",
        422,
        'Unprocessable Entity',
        'quote_not_in_bill',
      ),
    )
    render(<FeedRowDetail item={makeFeedItem()} />)

    selectQuotableText('Point one')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    const toolbar = await screen.findByRole('toolbar', { name: 'Selected text actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Share quote' }))

    expect(await within(toolbar).findByRole('status')).toHaveTextContent(
      'not part of this bill\'s summary',
    )
    expect(screen.queryByRole('dialog', { name: 'Share this quote' })).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('sends a selection to the bill chat when Ask about this is used', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<FeedRowDetail item={makeFeedItem()} />)

    selectQuotableText('It does something important in plain language.')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    const toolbar = await screen.findByRole('toolbar', { name: 'Selected text actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Ask about this' }))

    expect(screen.queryByRole('toolbar', { name: 'Selected text actions' })).not.toBeInTheDocument()
    expect(document.querySelector('.bill-chat-attachment')).toHaveAttribute(
      'title',
      'It does something important in plain language.',
    )
    expect(document.querySelector('.bill-chat-attachment-label')).toHaveTextContent(
      'It does something important in plain language.',
    )
    vi.useRealTimers()
  })

  it('shares selected chat-answer text with the signed answer payload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    chatMock.messages = [
      {
        id: 'asst-1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'The bill raises the spending cap for rural clinics.' },
          {
            type: 'data-answer',
            data: {
              text: 'The bill raises the spending cap for rural clinics.',
              sig: 'deadbeef',
              unverified_quotes: 0,
              refused: false,
            },
          },
        ],
      },
    ]
    vi.mocked(createBillQuote).mockResolvedValue({
      quote: {
        id: 'cafecafecafecafe',
        bill: { congress: 119, type: 'S', number: 2 },
        text: 'The bill raises the spending cap for rural clinics.',
        source: 'answer',
        created_at: '2026-09-01T00:00:00.000Z',
      },
      url: 'https://trackcongress.org/?bill=119-s-2&quote=cafecafecafecafe',
    })
    render(<FeedRowDetail item={makeFeedItem()} />)

    selectQuotableText('The bill raises the spending cap for rural clinics.')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    const toolbar = await screen.findByRole('toolbar', { name: 'Selected text actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Share quote' }))

    await waitFor(() => {
      expect(createBillQuote).toHaveBeenCalledWith({
        bill: '119-s-2',
        text: 'The bill raises the spending cap for rural clinics.',
        answer: {
          text: 'The bill raises the spending cap for rural clinics.',
          sig: 'deadbeef',
        },
      })
    })
    expect(await screen.findByRole('dialog', { name: 'Share this quote' })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('blocks sharing a chat answer when the signature is missing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    chatMock.messages = [
      {
        id: 'asst-1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'The bill raises the spending cap for rural clinics.' },
          {
            type: 'data-answer',
            data: {
              text: 'The bill raises the spending cap for rural clinics.',
              sig: null,
              unverified_quotes: 0,
              refused: false,
            },
          },
        ],
      },
    ]
    render(<FeedRowDetail item={makeFeedItem()} />)

    selectQuotableText('The bill raises the spending cap for rural clinics.')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    const toolbar = await screen.findByRole('toolbar', { name: 'Selected text actions' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Share quote' }))

    expect(await within(toolbar).findByRole('status')).toHaveTextContent(
      'Sharing chat answers is unavailable',
    )
    expect(createBillQuote).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
