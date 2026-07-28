import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FeedPassageVote } from '../api/types'
import { clearRollDefectorsCache } from '../api/rollDefectorsCache'
import { makeFeedItem } from '../test/feedItemFixtures'
import { FeedRowDetail } from './FeedRowDetail'

vi.mock('../api/client', () => ({
  fetchVoteDefectors: vi.fn(),
}))

import { fetchVoteDefectors } from '../api/client'

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
  clearRollDefectorsCache()
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

    render(<FeedRowDetail item={makeFeedItem()} />)

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

    render(<FeedRowDetail item={makeFeedItem()} />)

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

  it('copies a shareable bill link to the clipboard', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    const copied = String(writeText.mock.calls[0]?.[0] ?? '')
    expect(copied).toContain('bill=119-s-2')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
