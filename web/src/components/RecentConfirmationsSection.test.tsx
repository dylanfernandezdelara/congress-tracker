import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { RecentConfirmationItem } from '../api/types'
import { RecentConfirmationsSection } from './RecentConfirmationsSection'

function sampleConfirmation(overrides: Partial<RecentConfirmationItem> = {}): RecentConfirmationItem {
  return {
    chamber: 'Senate',
    congress: 119,
    session: 2,
    roll_number: 165,
    citation: 'PN100',
    nomination_number: 100,
    part_number: 0,
    nominee_names: [{ display_name: 'Jane Doe', state: 'CA' }],
    position_title: 'Secretary of Energy',
    organization: 'Department of Energy',
    description: 'Jane Doe, of California, to be Secretary of Energy.',
    question: 'On the Nomination',
    result: 'Confirmed',
    yeas: 58,
    nays: 40,
    vote_date: '2026-06-12',
    headline: 'Jane Doe confirmed as Energy Secretary',
    what_was_confirmed: 'The Senate confirmed Jane Doe as Secretary of Energy.',
    background: 'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
    key_points: [],
    congress_gov_url: 'https://www.congress.gov/nomination/119th-congress/100',
    wikipedia_url: null,
    wikipedia_extract: null,
    party_splits: [
      { party: 'R', yeas: 53, nays: 0, party_line: 'yea' },
      { party: 'D', yeas: 5, nays: 40, party_line: 'nay' },
    ],
    cross_party_votes: [],
    vote_context: null,
    ...overrides,
  }
}

describe('RecentConfirmationsSection', () => {
  it('renders nothing when empty', () => {
    const { container } = render(
      <RecentConfirmationsSection confirmations={[]} loading={false} error={null} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a single party-split vote chip without duplicate totals or PN', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[sampleConfirmation()]}
        loading={false}
        error={null}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Recent confirmations' })).toBeInTheDocument()
    expect(screen.getByText('Jane Doe confirmed as Energy Secretary')).toBeInTheDocument()
    expect(screen.getByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('Department of Energy')).toBeInTheDocument()
    expect(screen.getByText('R 53–0 · D 5–40')).toBeInTheDocument()
    // One vote story only — no separate total/margin chip alongside party splits.
    expect(screen.queryByText(/58–40/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\+18/)).not.toBeInTheDocument()
    expect(screen.queryByText('PN100')).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
      ),
    ).not.toBeInTheDocument()
  })

  it('falls back to yeas–nays when party splits are unavailable', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[sampleConfirmation({ party_splits: [] })]}
        loading={false}
        error={null}
      />,
    )

    expect(screen.getByText('58–40 · +18')).toBeInTheDocument()
    expect(screen.queryByText(/R 53–0/)).not.toBeInTheDocument()
  })

  it('shows who the nominee is in the collapsed row and moves it to About on expand', () => {
    const extract =
      'Erica G. Schwartz is an American health official. She previously served as Deputy Surgeon General.'
    render(
      <RecentConfirmationsSection
        confirmations={[
          sampleConfirmation({
            nominee_names: [{ display_name: 'Erica Schwartz', state: 'FL' }],
            headline:
              'Erica Schwartz confirmed as Director of the Centers for Disease Control and Prevention',
            wikipedia_url: 'https://en.wikipedia.org/wiki/Erica_Schwartz',
            wikipedia_extract: extract,
          }),
        ]}
        loading={false}
        error={null}
      />,
    )

    // Collapsed: the teaser leads with career history, not the vague lede.
    expect(
      screen.getByText('She previously served as Deputy Surgeon General.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(extract)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Expand details for Erica Schwartz/i }))
    expect(screen.getByText(extract)).toBeInTheDocument()
    expect(
      screen.queryByText('She previously served as Deputy Surgeon General.'),
    ).not.toBeInTheDocument()
  })

  it('shows who crossed party lines and why the vote was contested', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[
          sampleConfirmation({
            nominee_names: [{ display_name: 'Erica Schwartz', state: 'FL' }],
            headline: 'Erica Schwartz confirmed as CDC Director',
            party_splits: [
              { party: 'R', yeas: 50, nays: 0, party_line: 'yea' },
              { party: 'D', yeas: 1, nays: 42, party_line: 'nay' },
            ],
            cross_party_votes: [
              {
                name: 'Tim Kaine',
                party: 'D',
                state: 'VA',
                position: 'yea',
                party_line: 'nay',
              },
            ],
            vote_context:
              'At her Senate hearing, Schwartz said she supported withdrawing the U.S. from the World Health Organization.',
          }),
        ]}
        loading={false}
        error={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expand details for Erica Schwartz/i }))
    expect(screen.getByText('Why it was contested')).toBeInTheDocument()
    expect(
      screen.getByText(
        'At her Senate hearing, Schwartz said she supported withdrawing the U.S. from the World Health Organization.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Most Democrats voted against confirmation (D 1–42). Tim Kaine (D-VA) was the only Democrat to vote yes.',
      ),
    ).toBeInTheDocument()
  })

  it('never teases nominated-only phrasing for a confirmed vote', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[
          sampleConfirmation({
            nominee_names: [{ display_name: 'Erica Schwartz', state: 'FL' }],
            headline:
              'Erica Schwartz confirmed as Director of the Centers for Disease Control and Prevention',
            wikipedia_url: 'https://en.wikipedia.org/wiki/Erica_Schwartz',
            wikipedia_extract:
              'Erica Schwartz was nominated to be CDC director in 2026. She previously served as Deputy Surgeon General.',
          }),
        ]}
        loading={false}
        error={null}
      />,
    )

    expect(screen.queryByText(/was nominated/)).not.toBeInTheDocument()
    expect(
      screen.getByText('She previously served as Deputy Surgeon General.'),
    ).toBeInTheDocument()
  })

  it('prefers person Wikipedia About and shows opposition plus compact sources', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[
          sampleConfirmation({
            wikipedia_url: 'https://en.wikipedia.org/wiki/Jane_Doe_(politician)',
            wikipedia_extract:
              'Jane Doe is an American energy official who previously led state clean-energy programs.',
          }),
        ]}
        loading={false}
        error={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expand details for Jane Doe/i }))
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Jane Doe is an American energy official who previously led state clean-energy programs.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('From Wikipedia')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
      ),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Vote')).toBeInTheDocument()
    expect(
      screen.getByText('Most Democrats voted against confirmation (D 5–40).'),
    ).toBeInTheDocument()

    const congressLink = screen.getByRole('link', { name: 'Congress.gov' })
    const wikiLink = screen.getByRole('link', { name: 'Wikipedia' })
    expect(congressLink).toHaveAttribute(
      'href',
      'https://www.congress.gov/nomination/119th-congress/100',
    )
    expect(wikiLink).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Jane_Doe_(politician)',
    )
    expect(
      congressLink.compareDocumentPosition(wikiLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does not show a Wikipedia link without a confident article', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[sampleConfirmation()]}
        loading={false}
        error={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expand details for Jane Doe/i }))
    expect(screen.queryByRole('link', { name: 'Wikipedia' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Congress.gov' })).toBeInTheDocument()
  })
})
