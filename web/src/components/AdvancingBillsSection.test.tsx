import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { AdvancingBillItem } from '../api/types'
import { AdvancingBillsSection } from './AdvancingBillsSection'

function sampleItem(overrides: Partial<AdvancingBillItem> = {}): AdvancingBillItem {
  return {
    congress: 119,
    bill_type: 'HR',
    bill_number: 7008,
    title: 'Stop Insider Trading Act',
    policy_area: 'Congress',
    headline: 'Congress Members Banned From Buying Stocks, Must Disclose Sales',
    last_advance_at: '2026-06-13T12:00:00.000Z',
    current_label: 'In House Administration Committee · waiting for the committee to act',
    process: null,
    item: null,
    ...overrides,
  }
}

describe('AdvancingBillsSection', () => {
  it('renders the process strip above the feed with status-first copy', () => {
    render(
      <MemoryRouter>
        <AdvancingBillsSection items={[sampleItem()]} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Moving through committee' })).toBeInTheDocument()
    expect(
      screen.getByText('In House Administration Committee · waiting for the committee to act'),
    ).toBeInTheDocument()
    expect(screen.getByText(/7008/)).toBeInTheDocument()
  })

  it('expands a row to show congress.gov fallback when feed item is missing', () => {
    render(
      <MemoryRouter>
        <AdvancingBillsSection items={[sampleItem()]} />
      </MemoryRouter>,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /Expand committee process for H\.R\. 7008/i,
      }),
    )

    expect(screen.getByRole('link', { name: /Read on congress\.gov/i })).toHaveAttribute(
      'href',
      'https://www.congress.gov/bill/119th-congress/house-bill/7008',
    )
  })

  it('hides when there are no advancing bills', () => {
    const { container } = render(
      <MemoryRouter>
        <AdvancingBillsSection items={[]} />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
