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

  it('shows confirmation headline, org chip, and background teaser without a duplicate role header', () => {
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
    expect(
      screen.getByText('Jane Doe of California was nominated to lead the Department of Energy.'),
    ).toBeInTheDocument()
    // Role was previously a second header that restated the headline ("Secretary of Energy · …").
    expect(screen.queryByText('Secretary of Energy · Department of Energy')).not.toBeInTheDocument()
  })

  it('omits teaser when background is raw nomination scaffolding (org chip remains)', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[
          sampleConfirmation({
            background:
              'Jane Doe, of California, to be Secretary of Energy.\nPosition: Secretary of Energy (Department of Energy)\nNominee(s): Jane Doe (CA)',
          }),
        ]}
        loading={false}
        error={null}
      />,
    )

    expect(screen.getByText('Department of Energy')).toBeInTheDocument()
    expect(screen.queryByText(/Position: Secretary of Energy/)).not.toBeInTheDocument()
    expect(screen.queryByText('Secretary of Energy · Department of Energy')).not.toBeInTheDocument()
  })

  it('expands background detail without restating the confirmation as a second header', () => {
    render(
      <RecentConfirmationsSection
        confirmations={[sampleConfirmation()]}
        loading={false}
        error={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Expand details for PN100/i }))
    expect(screen.queryByText('What was confirmed')).not.toBeInTheDocument()
    expect(
      screen.queryByText('The Senate confirmed Jane Doe as Secretary of Energy.'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Background')).toBeInTheDocument()
    expect(
      screen.getByText('Jane Doe of California was nominated to lead the Department of Energy.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Read on congress.gov/i })).toHaveAttribute(
      'href',
      'https://www.congress.gov/nomination/119th-congress/100',
    )
  })
})
