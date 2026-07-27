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
  fetchFeed: vi.fn(async () => ({
    items: [
      {
        bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
        policy_area: 'Immigration',
        digest: {
          headline: 'Gives Money for Border and Immigration Enforcement Until 2029',
          what_it_does: 'Funds border enforcement programs through 2029.',
          key_points: ['Adds border funding'],
          terms_explained: [],
        },
        raw_summary_text: null,
        passage_votes: [],
        latest_passage_date: '2026-06-09',
        latest_activity_date: '2026-06-09',
        lifecycle: null,
      },
    ],
    total: 1,
    limit: 15,
    offset: 0,
    has_more: false,
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
  it('shows chamber, vote date, and short bill id in meta', () => {
    render(<NotableVotesSection notable={[sampleEntry()]} />)

    expect(
      screen.getByText((_, node) => node?.textContent === 'House · Jun 9 · S. 2'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/119th Congress/i)).not.toBeInTheDocument()
  })

  it('opens an in-place bill sheet when the notable headline is clicked', async () => {
    render(<NotableVotesSection notable={[sampleEntry()]} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open bill details for Gives Money for Border and Immigration Enforcement Until 2029',
      }),
    )

    const dialog = screen.getByRole('dialog', {
      name: 'Gives Money for Border and Immigration Enforcement Until 2029',
    })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/214–212 \(2\)/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Funds border enforcement programs through 2029.')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /Read on congress.gov/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/bill/119th-congress/senate-bill/2'),
    )
  })

  it('opens a bill sheet from the compact headline without changing the page URL', async () => {
    render(<NotableVotesSection variant="compact" notable={[sampleEntry()]} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open bill details for Gives Money for Border and Immigration Enforcement Until 2029',
      }),
    )

    expect(
      screen.getByRole('dialog', {
        name: 'Gives Money for Border and Immigration Enforcement Until 2029',
      }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('What it does')).toBeInTheDocument()
    })
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
