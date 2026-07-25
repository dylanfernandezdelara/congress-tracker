import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TEXT_CHANGES_MAX_LISTED_PROVISIONS } from '@congress-tracker/shared/bill-text-constants'
import type { BillTextChanges } from '../api/types'
import { BillTextChangesSection } from './BillTextChangesSection'

const hr7008Changes: BillTextChanges = {
  summary_version: 'Reported in House',
  summary_version_date: '2026-02-03',
  latest_version: 'Engrossed in House',
  latest_version_date: '2026-07-22',
  added_provisions: [
    { label: '3.', heading: 'Requiring voters to provide photo identification' },
    { label: '303A.', heading: 'Photo identification requirements' },
  ],
  more_added_count: 0,
}

function manyProvisions(count: number): BillTextChanges['added_provisions'] {
  return Array.from({ length: count }, (_, i) => ({
    label: `${i + 1}.`,
    heading: `Added provision ${i + 1}`,
  }))
}

describe('BillTextChangesSection', () => {
  it('names the provisions the summary does not describe', () => {
    render(<BillTextChangesSection changes={hr7008Changes} />)

    expect(screen.getByText('Added after this summary')).toBeInTheDocument()
    expect(screen.getByText('Sec. 3')).toBeInTheDocument()
    expect(
      screen.getByText('Requiring voters to provide photo identification'),
    ).toBeInTheDocument()
    expect(screen.getByText('Sec. 303A')).toBeInTheDocument()
  })

  it('explains which version the summary covers', () => {
    render(<BillTextChangesSection changes={hr7008Changes} />)

    expect(
      screen.getByText(/describes this bill reported by committee \(Feb 3, 2026\)/),
    ).toBeInTheDocument()
    expect(screen.getByText(/passed by the House on Jul 22, 2026/)).toBeInTheDocument()
  })

  it('counts additions beyond the listed provisions', () => {
    render(
      <BillTextChangesSection changes={{ ...hr7008Changes, more_added_count: 5 }} />,
    )
    expect(screen.getByText('+ 5 more added sections')).toBeInTheDocument()
  })

  it('uses singular copy for a single extra addition', () => {
    render(
      <BillTextChangesSection changes={{ ...hr7008Changes, more_added_count: 1 }} />,
    )
    expect(screen.getByText('+ 1 more added section')).toBeInTheDocument()
  })

  it('collapses long lists behind a Show all toggle', () => {
    const stored = TEXT_CHANGES_MAX_LISTED_PROVISIONS + 3
    const overflow = 2
    render(
      <BillTextChangesSection
        changes={{
          ...hr7008Changes,
          added_provisions: manyProvisions(stored),
          more_added_count: overflow,
        }}
      />,
    )

    expect(screen.getAllByText(/Added provision/)).toHaveLength(
      TEXT_CHANGES_MAX_LISTED_PROVISIONS,
    )
    expect(screen.queryByText('+ 2 more added sections')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        `${stored - TEXT_CHANGES_MAX_LISTED_PROVISIONS + overflow} more not shown`,
      ),
    ).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: `Show all ${stored}` })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)

    expect(screen.getAllByText(/Added provision/)).toHaveLength(stored)
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByText('+ 2 more added sections')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.getAllByText(/Added provision/)).toHaveLength(
      TEXT_CHANGES_MAX_LISTED_PROVISIONS,
    )
    expect(screen.queryByText('+ 2 more added sections')).not.toBeInTheDocument()
  })

  it('does not offer a toggle when every provision already fits', () => {
    render(<BillTextChangesSection changes={hr7008Changes} />)
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('renders nothing when no provisions were added', () => {
    const { container } = render(
      <BillTextChangesSection changes={{ ...hr7008Changes, added_provisions: [] }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
