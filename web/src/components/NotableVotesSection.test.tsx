import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { NotableVoteEntry } from '../api/types'
import { NotableVotesSection } from './NotableVotesSection'

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

    expect(
      screen.getByText('Per-member vote breakdown is not available for this roll call yet.'),
    ).toBeInTheDocument()
  })
})
