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

  it('shows headline and vote chips without PN citation or collapsed About teaser', () => {
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
    expect(screen.queryByText('PN100')).not.toBeInTheDocument()
    expect(
      screen.queryByText(
        'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
      ),
    ).not.toBeInTheDocument()
  })

  it('expands official About first, with Congress.gov before Wikipedia', () => {
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
        'Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('More background')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Jane Doe is an American energy official who previously led state clean-energy programs.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('From Wikipedia')).toBeInTheDocument()

    const congressLink = screen.getByRole('link', { name: /Congress\.gov/i })
    const wikiLink = screen.getByRole('link', { name: /^Wikipedia/i })
    expect(congressLink).toHaveAttribute(
      'href',
      'https://www.congress.gov/nomination/119th-congress/100',
    )
    expect(wikiLink).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Jane_Doe_(politician)',
    )
    // Official Congress.gov link is listed before Wikipedia.
    expect(
      congressLink.compareDocumentPosition(wikiLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('does not show a Wikipedia search fallback without a confident article', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[sampleConfirmation()]}
        loading={false}
        error={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expand details for Jane Doe/i }))
    expect(screen.queryByRole('link', { name: /Wikipedia/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Congress\.gov/i })).toBeInTheDocument()
  })
})
