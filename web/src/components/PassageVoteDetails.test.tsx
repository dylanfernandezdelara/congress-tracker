import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PassageVoteDetails, VoteSplitBar } from './PassageVoteDetails'

describe('VoteSplitBar', () => {
  it('exposes an accessible vote summary', () => {
    render(<VoteSplitBar chamber="House" yeas={220} nays={213} />)
    expect(screen.getByRole('img', { name: 'House vote: 220 yea, 213 nay' })).toBeInTheDocument()
  })
})

describe('PassageVoteDetails', () => {
  it('labels each chamber split bar from vote props', () => {
    render(
      <PassageVoteDetails
        votes={[
          {
            chamber: 'Senate',
            congress: 119,
            session: 2,
            roll_number: 10,
            question: 'On Passage',
            result: 'Passed',
            yeas: 52,
            nays: 47,
            date: '2026-06-05',
          },
        ]}
        defectorsByRoll={new Map()}
      />,
    )

    expect(screen.getByRole('img', { name: 'Senate vote: 52 yea, 47 nay' })).toBeInTheDocument()
    expect(screen.getByText('52–47')).toBeInTheDocument()
  })
})
