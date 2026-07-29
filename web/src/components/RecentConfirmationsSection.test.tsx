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
    background: 'Jane Doe of California was nominated to lead the Department of Energy.',
    key_points: ['Cabinet-level confirmation'],
    congress_gov_url: 'https://www.congress.gov/nomination/119th-congress/100',
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

  it('shows confirmation headline and expands background detail', () => {
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
    expect(screen.getByText('Secretary of Energy · Department of Energy')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Expand details for PN100/i }))
    expect(screen.getByText('What was confirmed')).toBeInTheDocument()
    expect(
      screen.getByText('The Senate confirmed Jane Doe as Secretary of Energy.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Jane Doe of California was nominated to lead the Department of Energy.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Read on congress.gov/i })).toHaveAttribute(
      'href',
      'https://www.congress.gov/nomination/119th-congress/100',
    )
  })
})
