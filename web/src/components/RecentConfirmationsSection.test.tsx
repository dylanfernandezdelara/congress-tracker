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
    background:
      'Jane Doe is an energy policy expert from California who previously led state clean-energy programs.',
    key_points: ['Cabinet-level confirmation'],
    congress_gov_url: 'https://www.congress.gov/nomination/119th-congress/100',
    wikipedia_url: null,
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

  it('shows headline and vote chips without PN citation or collapsed bio teaser', () => {
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
    expect(screen.queryByText('Senate')).not.toBeInTheDocument()
    // Collapsed row should not repeat the person blurb under the title.
    expect(
      screen.queryByText(
        'Jane Doe is an energy policy expert from California who previously led state clean-energy programs.',
      ),
    ).not.toBeInTheDocument()
  })

  it('expands to an About blurb with Wikipedia search and Congress.gov links', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[sampleConfirmation()]}
        loading={false}
        error={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expand details for Jane Doe/i }))
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Jane Doe is an energy policy expert from California who previously led state clean-energy programs.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('Key points')).not.toBeInTheDocument()
    expect(screen.queryByText('What was confirmed')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Search Wikipedia/i })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Special:Search?search=Jane%20Doe',
    )
    expect(screen.getByRole('link', { name: /Congress\.gov/i })).toHaveAttribute(
      'href',
      'https://www.congress.gov/nomination/119th-congress/100',
    )
  })

  it('links a stored Wikipedia article when enrichment found one', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[
          sampleConfirmation({
            wikipedia_url: 'https://en.wikipedia.org/wiki/Jane_Doe_(politician)',
          }),
        ]}
        loading={false}
        error={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expand details for Jane Doe/i }))
    expect(screen.getByRole('link', { name: /^Wikipedia/i })).toHaveAttribute(
      'href',
      'https://en.wikipedia.org/wiki/Jane_Doe_(politician)',
    )
  })

  it('shows a fallback when no person blurb is available', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[sampleConfirmation({ background: null })]}
        loading={false}
        error={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expand details for Jane Doe/i }))
    expect(
      screen.getByText('Confirmed for Secretary of Energy. A short bio is not available yet.'),
    ).toBeInTheDocument()
  })
})
