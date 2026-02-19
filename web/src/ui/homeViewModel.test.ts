import { describe, expect, it } from 'vitest'
import type { ActivityIndexResponse, SessionOverview, VoteLedger } from '../api'
import { buildBillTimelineVM, toActionCards } from './homeViewModel'

function makeOverview(totalVotes: number, latestVoteDate: string): SessionOverview {
  return {
    congress: 119,
    session: 2,
    generated_at: '2026-01-20T00:00:00Z',
    total_votes: totalVotes,
    latest_vote_date: latestVoteDate,
    total_defections: 0,
    senators: [
      {
        bioguide_id: 'A000001',
        name: 'Alpha, Ada',
        party: 'D',
        state: 'NY',
        votes_cast: totalVotes,
        votes_missed: 0,
        party_defections: 0,
        alignment_pct: 100,
      },
      {
        bioguide_id: 'B000001',
        name: 'Bravo, Ben',
        party: 'R',
        state: 'TX',
        votes_cast: totalVotes,
        votes_missed: 0,
        party_defections: 0,
        alignment_pct: 100,
      },
    ],
  }
}

describe('buildBillTimelineVM', () => {
  it('derives final status from the last decisive step', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-06T00:00:00Z',
      total_votes: 2,
      entries: [
        {
          vote_number: 102,
          vote_date: '2026-01-06',
          title: 'S. 100 final vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 100',
          member_votes: {
            A000001: 'Yea',
            B000001: 'Nay',
          },
        },
        {
          vote_number: 101,
          vote_date: '2026-01-05',
          title: 'S. 100 cloture vote',
          question: 'On the Motion to Invoke Cloture',
          result: 'Rejected',
          issue: 'S. 100',
          member_votes: {
            A000001: 'Nay',
            B000001: 'Yea',
          },
        },
      ],
    }
    const activities: ActivityIndexResponse = {
      generated_at: '2026-01-06T00:00:00Z',
      window: { start_date: '2026-01-01', end_date: '2026-01-06' },
      activities: [
        {
          activity_id: 'senate:roll_call_vote:2026-01-06:102',
          source: 'senate',
          type: 'roll_call_vote',
          date: '2026-01-06',
          members: ['A000001', 'B000001'],
          bill: { congress: 119, type: 'S', number: '100', title: 'Example Act' },
        },
      ],
    }

    const vm = buildBillTimelineVM(
      ledger,
      makeOverview(2, '2026-01-06'),
      activities,
      { windowDays: 7, referenceDate: '2026-01-06' },
    )

    expect(vm).toHaveLength(1)
    expect(vm[0].finalStatus).toBe('passed')
  })

  it('respects the week window used for the section subtitle', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-20T00:00:00Z',
      total_votes: 2,
      entries: [
        {
          vote_number: 220,
          vote_date: '2026-01-20',
          title: 'S. 200 passage vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 200',
          member_votes: {
            A000001: 'Yea',
            B000001: 'Nay',
          },
        },
        {
          vote_number: 120,
          vote_date: '2026-01-05',
          title: 'S. 120 passage vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 120',
          member_votes: {
            A000001: 'Yea',
            B000001: 'Nay',
          },
        },
      ],
    }

    const vm = buildBillTimelineVM(
      ledger,
      makeOverview(2, '2026-01-20'),
      null,
      { windowDays: 7, referenceDate: '2026-01-20' },
    )

    expect(vm).toHaveLength(1)
    expect(vm[0].groupKey).toBe('S. 200')
  })

  it('marks lifecycle as enacted when law metadata is present', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-20T00:00:00Z',
      total_votes: 1,
      entries: [
        {
          vote_number: 300,
          vote_date: '2026-01-20',
          title: 'S. 300 procedural vote',
          question: 'On the Motion to Proceed',
          result: 'Agreed to',
          issue: 'S. 300',
          member_votes: {
            A000001: 'Yea',
            B000001: 'Nay',
          },
        },
      ],
    }
    const activities: ActivityIndexResponse = {
      generated_at: '2026-01-20T00:00:00Z',
      window: { start_date: '2026-01-10', end_date: '2026-01-20' },
      activities: [
        {
          activity_id: 'senate:roll_call_vote:2026-01-20:300',
          source: 'senate',
          type: 'roll_call_vote',
          date: '2026-01-20',
          members: ['A000001', 'B000001'],
          bill: {
            congress: 119,
            type: 'S',
            number: '300',
            title: 'Already Enacted Act',
            law: { number: '123', type: 'PL' },
          },
        },
      ],
    }

    const vm = buildBillTimelineVM(
      ledger,
      makeOverview(1, '2026-01-20'),
      activities,
      { windowDays: 7, referenceDate: '2026-01-20' },
    )

    expect(vm).toHaveLength(1)
    expect(vm[0].whatHappensNext).toContain('law')
    expect(vm[0].finalStatus).toBe('passed')
  })

  it('applies ranking budget caps deterministically', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-20T00:00:00Z',
      total_votes: 3,
      entries: [
        {
          vote_number: 401,
          vote_date: '2026-01-20',
          title: 'S. 401 vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 401',
          member_votes: { A000001: 'Yea', B000001: 'Nay' },
        },
        {
          vote_number: 402,
          vote_date: '2026-01-19',
          title: 'S. 402 vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 402',
          member_votes: { A000001: 'Yea', B000001: 'Nay' },
        },
        {
          vote_number: 403,
          vote_date: '2026-01-18',
          title: 'S. 403 vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 403',
          member_votes: { A000001: 'Yea', B000001: 'Nay' },
        },
      ],
    }

    const vm = buildBillTimelineVM(
      ledger,
      makeOverview(3, '2026-01-20'),
      null,
      { windowDays: 7, referenceDate: '2026-01-20', totalBudget: 2, keyBudget: 1 },
    )

    expect(vm).toHaveLength(2)
    expect(new Set(vm.map((item) => item.groupKey)).size).toBe(2)
  })
})

describe('toActionCards', () => {
  it('produces substantive titles (never procedural patterns)', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-06T00:00:00Z',
      total_votes: 1,
      entries: [
        {
          vote_number: 501,
          vote_date: '2026-01-06',
          title: 'S. 500 vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 500',
          member_votes: { A000001: 'Yea', B000001: 'Nay' },
        },
      ],
    }
    const activities: ActivityIndexResponse = {
      generated_at: '2026-01-06T00:00:00Z',
      window: { start_date: '2026-01-01', end_date: '2026-01-06' },
      activities: [
        {
          activity_id: 'senate:roll_call_vote:2026-01-06:501',
          source: 'senate',
          type: 'roll_call_vote',
          date: '2026-01-06',
          members: ['A000001', 'B000001'],
          bill: { congress: 119, type: 'S', number: '500', title: 'The Example Act of 2026' },
        },
      ],
    }

    const vm = buildBillTimelineVM(ledger, makeOverview(1, '2026-01-06'), activities, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toActionCards(vm)

    expect(cards).toHaveLength(1)
    expect(cards[0].title).not.toMatch(/was blocked|Senate vote|final vote|nomination vote/i)
    expect(cards[0].outcome).toBeTruthy()
    expect(cards[0].voteLine.yea + cards[0].voteLine.nay).toBeGreaterThan(0)
  })

  it('includes the lead party on the vote line', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-06T00:00:00Z',
      total_votes: 1,
      entries: [
        {
          vote_number: 501,
          vote_date: '2026-01-06',
          title: 'S. 500 vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 500',
          member_votes: { A000001: 'Yea', B000001: 'Nay' },
        },
      ],
    }

    const vm = buildBillTimelineVM(ledger, makeOverview(1, '2026-01-06'), null, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toActionCards(vm)

    expect(cards).toHaveLength(1)
    expect(cards[0].voteLine.leadParty).not.toBeNull()
    expect(cards[0].voteLine.leadParty!.abbr).toBe('D')
  })

  it('context falls back without hedging when no concrete signals exist', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-06T00:00:00Z',
      total_votes: 1,
      entries: [
        {
          vote_number: 601,
          vote_date: '2026-01-06',
          title: 'S. 600 vote',
          question: 'On Passage of the Bill',
          result: 'Rejected',
          issue: 'S. 600',
          member_votes: { A000001: 'Nay', B000001: 'Yea' },
        },
      ],
    }

    const vm = buildBillTimelineVM(ledger, makeOverview(1, '2026-01-06'), null, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toActionCards(vm)

    expect(cards).toHaveLength(1)
    expect(cards[0].context).not.toMatch(/Official sources|limited detail|not specified/i)
  })
})

