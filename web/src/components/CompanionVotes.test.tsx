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

  it('does not show Senate LIS <measure> markup in the question', () => {
    render(
      <CompanionVotes
        votes={[
          {
            ...motionToRecommit,
            chamber: 'Senate',
            roll_number: 227,
            question: 'On the Motion to Table <measure>S.Amdt. 6747</measure>',
            result: 'Agreed to',
            yeas: 52,
            nays: 45,
            date: '2026-08-08',
          },
        ]}
      />,
    )

    expect(screen.getByText('On the Motion to Table S.Amdt. 6747')).toBeInTheDocument()
    expect(screen.queryByText(/<measure>/i)).not.toBeInTheDocument()
  })

  it('renders nothing when there are no companion rolls', () => {
    const { container } = render(<CompanionVotes votes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
