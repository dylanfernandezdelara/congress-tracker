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

  it('links defectors with congress.gov urls and leaves others as text', () => {
    const vote = {
      chamber: 'Senate' as const,
      congress: 119,
      session: 2,
      roll_number: 10,
      question: 'On Passage',
      result: 'Passed',
      yeas: 52,
      nays: 47,
      date: '2026-06-05',
    }
    render(
      <PassageVoteDetails
        votes={[vote]}
        defectorsByRoll={
          new Map([
            [
              'Senate:119:2:10',
              {
                status: 'ready' as const,
                defectors: [
                  {
                    bioguide_id: 'C001088',
                    name: 'Chris Coons',
                    party: 'D',
                    state: 'DE',
                    position: 'nay' as const,
                    party_line: 'yea' as const,
                    congress_gov_url:
                      'https://www.congress.gov/member/chris-coons/C001088',
                  },
                  {
                    bioguide_id: 'LOCAL:s001',
                    name: 'Local Sample',
                    party: 'R',
                    state: 'TX',
                    position: 'yea' as const,
                    party_line: 'nay' as const,
                    congress_gov_url: null,
                  },
                ],
                partySplits: [],
              },
            ],
          ])
        }
      />,
    )

    const linkedName = screen.getByRole('link', { name: 'Chris Coons' })
    expect(linkedName).toHaveAttribute(
      'href',
      'https://www.congress.gov/member/chris-coons/C001088',
    )
    expect(linkedName.closest('li')).toHaveTextContent(/^Chris Coons\s*D-DE$/)
    expect(screen.queryByRole('link', { name: 'Local Sample' })).not.toBeInTheDocument()
    const plainName = screen.getByText('Local Sample')
    expect(plainName.closest('li')).toHaveTextContent(/^Local Sample\s*R-TX$/)
  })
})
