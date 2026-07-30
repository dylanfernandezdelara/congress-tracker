import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { SessionStatsResponse } from '../api/types'
import { FederalControlCompact } from './FederalControlCompact'

const composition: SessionStatsResponse['composition'] = {
  house: {
    total: 435,
    majority_party: 'R',
    control_label: 'Republican control',
    is_sample: false,
    seats_up_for_election: 435,
    election_year: 2026,
    seats: [
      { party: 'R', seats: 218 },
      { party: 'D', seats: 212 },
      { party: 'I', seats: 1 },
    ],
  },
  senate: {
    total: 100,
    majority_party: 'R',
    control_label: 'Republican control',
    is_sample: false,
    seats_up_for_election: 33,
    election_year: 2026,
    seats: [
      { party: 'R', seats: 53 },
      { party: 'D', seats: 45 },
      { party: 'I', seats: 2 },
    ],
  },
}

describe('FederalControlCompact', () => {
  it('renders a dense control summary without repeating majority party names', () => {
    render(<FederalControlCompact composition={composition} />)

    const region = screen.getByRole('region', { name: 'Federal Control' })
    expect(within(region).getByRole('heading', { name: 'Federal Control' })).toBeInTheDocument()

    expect(within(region).getByText('House')).toBeInTheDocument()
    expect(within(region).getByText('Senate')).toBeInTheDocument()
    expect(within(region).getByText('President')).toBeInTheDocument()
    expect(within(region).getByText('Donald Trump')).toBeInTheDocument()

    // Seat counts remain; spelled-out majority labels are dropped from the visible UI.
    expect(within(region).getByText(/D 212/)).toBeInTheDocument()
    expect(within(region).getByText(/R 218/)).toBeInTheDocument()
    expect(within(region).getByText(/D 45/)).toBeInTheDocument()
    expect(within(region).getByText(/R 53/)).toBeInTheDocument()
    expect(within(region).queryByText('Republican')).not.toBeInTheDocument()

    // Control still announced to assistive tech.
    expect(
      within(region).getByLabelText(/House: Republican control\. D 212 · I 1 · R 218/),
    ).toBeInTheDocument()
    expect(
      within(region).getByLabelText(/President: Donald Trump, Republican/),
    ).toBeInTheDocument()
  })

  it('shows loading and error states', () => {
    const { rerender } = render(<FederalControlCompact composition={null} loading />)
    expect(screen.getByText('Loading control…')).toBeInTheDocument()

    const onRetry = vi.fn()
    rerender(
      <FederalControlCompact composition={null} error="Couldn't load control." onRetry={onRetry} />,
    )
    expect(screen.getByText("Couldn't load control.")).toBeInTheDocument()
    screen.getByRole('button', { name: 'Retry' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
