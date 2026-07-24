import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearMemberProfileCache, loadMemberProfile } from '../api/memberProfileCache'
import type { NotableVoteEntry } from '../api/types'
import { NotableVotesSection } from './NotableVotesSection'

vi.mock('../api/client', () => ({
  fetchMemberProfile: vi.fn(async () => ({
    bioguide_id: 'A000001',
    name: 'Jane Example',
    chamber: 'House',
    party: 'D',
    state: 'CA',
    district: 12,
    photo_url: 'https://example.com/jane.jpg',
    congress_gov_url: 'https://www.congress.gov/member/a000001',
    congress: 119,
    session: 2,
    votes_cast: 10,
    yea_count: 6,
    nay_count: 4,
    cross_vote_count: 1,
    cross_vote_label: 'rare',
    recent_cross_votes: [],
    member_votes_available: true,
    as_of: '2026-07-20T00:00:00.000Z',
  })),
}))

function sampleEntry(overrides: Partial<NotableVoteEntry> = {}): NotableVoteEntry {
  return {
    chamber: 'House',
    congress: 119,
    session: 2,
    roll_number: 214,
    bill_type: 'S',
    bill_number: 2,
    yeas: 214,
    nays: 212,
    margin: 2,
    vote_date: '2026-06-09',
    headline: 'Gives Money for Border and Immigration Enforcement Until 2029',
    significance_score: 43,
    why_it_matters: 'Passed in the House by just 2 votes',
    defectors: [],
    member_votes_available: false,
    ...overrides,
  }
}

describe('NotableVotesSection', () => {
  it('shows chamber and vote date only in meta', () => {
    render(<NotableVotesSection notable={[sampleEntry()]} />)

    expect(screen.getByText('House · Jun 9')).toBeInTheDocument()
    expect(screen.queryByText(/S\. 2/)).not.toBeInTheDocument()
    expect(screen.queryByText(/119th Congress/i)).not.toBeInTheDocument()
  })

  afterEach(() => {
    vi.clearAllMocks()
    clearMemberProfileCache()
    document.body.style.overflow = ''
  })

  it('shows defector avatars when cross-voters are present', () => {
    render(
      <NotableVotesSection
        notable={[
          sampleEntry({
            member_votes_available: true,
            defectors: [
              {
                bioguide_id: 'A000001',
                name: 'Jane Example',
                party: 'D',
                state: 'CA',
                photo_url: 'https://example.com/jane.jpg',
                cross_vote_count: 1,
                cross_vote_label: 'rare',
              },
            ],
          }),
        ]}
      />,
    )

    expect(screen.getByText('Jane Example')).toBeInTheDocument()
    expect(screen.getByText('Rare party-line break')).toBeInTheDocument()
  })

  it('opens a member profile when a notable defector is clicked', async () => {
    render(
      <NotableVotesSection
        notable={[
          sampleEntry({
            member_votes_available: true,
            defectors: [
              {
                bioguide_id: 'A000001',
                name: 'Jane Example',
                party: 'D',
                state: 'CA',
                photo_url: 'https://example.com/jane.jpg',
                cross_vote_count: 1,
                cross_vote_label: 'rare',
              },
            ],
          }),
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open profile for Jane Example' }))

    expect(screen.getByRole('dialog', { name: 'Jane Example' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('CA-12')).toBeInTheDocument()
    })
  })

  it('prefetches visible defector profiles so the sheet opens without loading', async () => {
    render(
      <NotableVotesSection
        notable={[
          sampleEntry({
            member_votes_available: true,
            defectors: [
              {
                bioguide_id: 'A000001',
                name: 'Jane Example',
                party: 'D',
                state: 'CA',
                photo_url: 'https://example.com/jane.jpg',
                cross_vote_count: 1,
                cross_vote_label: 'rare',
              },
            ],
          }),
        ]}
      />,
    )

    /* Rendering the section starts the prefetch; loadMemberProfile de-dupes
       to the same in-flight request, so awaiting it waits for the cache. */
    await loadMemberProfile('A000001')

    fireEvent.click(screen.getByRole('button', { name: 'Open profile for Jane Example' }))

    expect(screen.queryByText('Loading session voting stats…')).not.toBeInTheDocument()
    expect(screen.getByText('CA-12')).toBeInTheDocument()
  })

  it('states when no members broke with their party', () => {
    render(
      <NotableVotesSection
        notable={[
          sampleEntry({
            member_votes_available: true,
            defectors: [],
          }),
        ]}
      />,
    )

    expect(
      screen.getByText('No members broke with their party on this House vote.'),
    ).toBeInTheDocument()
  })

  it('states when per-member vote data is not ingested yet', () => {
    render(
      <NotableVotesSection
        notable={[
          sampleEntry({
            member_votes_available: false,
            defectors: [],
          }),
        ]}
      />,
    )

    expect(screen.getByText('Member-level votes not available yet.')).toBeInTheDocument()
  })

  it('shows an empty state when there are no notable votes', () => {
    render(<NotableVotesSection notable={[]} />)

    expect(screen.getByRole('region', { name: 'Notable votes' })).toBeInTheDocument()
    expect(screen.getByText('No notable votes yet this session.')).toBeInTheDocument()
  })
})
