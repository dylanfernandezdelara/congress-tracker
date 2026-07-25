import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { FeedCompanionVote } from '../api/types'
import { CompanionVotes } from './CompanionVotes'

const motionToRecommit: FeedCompanionVote = {
  chamber: 'House',
  congress: 119,
  session: 2,
  roll_number: 279,
  question: 'On Motion to Recommit',
  result: 'Failed',
  yeas: 211,
  nays: 218,
  date: '2026-07-22',
}

describe('CompanionVotes', () => {
  it('shows the question, outcome, and tally for each related roll', () => {
    render(<CompanionVotes votes={[motionToRecommit]} />)

    expect(screen.getByText('Related floor votes')).toBeInTheDocument()
    expect(screen.getByText('On Motion to Recommit')).toBeInTheDocument()
    expect(screen.getByText(/Failed · 211–218 · Jul 22/)).toBeInTheDocument()
  })

  it('renders nothing when there are no companion rolls', () => {
    const { container } = render(<CompanionVotes votes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
