import { describe, expect, it } from 'vitest'

import type { BillLifecycle } from '../api/types'
import { makeFeedItem } from '../test/feedItemFixtures'
import { deriveTerminalStatus, getBillLifecycleStages } from './billLifecycleStages'

function makeLifecycle(overrides: Partial<BillLifecycle> = {}): BillLifecycle {
  const { derived: derivedOverrides, ...rest } = overrides
  return {
    introduced_date: null,
    presented_date: null,
    signed_date: null,
    vetoed_date: null,
    became_law_date: null,
    law_kind: null,
    public_law: null,
    latest_action_date: null,
    latest_action_text: null,
    ...rest,
    derived: {
      status: null,
      day_of_ten: null,
      deadline_date: null,
      becomes_law_on: null,
      ...derivedOverrides,
    },
  }
}

const hr6644Votes = [
  {
    chamber: 'House' as const,
    congress: 119,
    session: 2,
    roll_number: 100,
    question: 'On Passage of the Bill',
    result: 'Passed',
    yeas: 220,
    nays: 210,
    date: '2026-05-14',
  },
  {
    chamber: 'Senate' as const,
    congress: 119,
    session: 2,
    roll_number: 200,
    question: 'On Passage of the Bill',
    result: 'Passed',
    yeas: 85,
    nays: 5,
    date: '2026-06-24',
  },
]

describe('deriveTerminalStatus', () => {
  it('prefers formal law_kind over derived status', () => {
    expect(
      deriveTerminalStatus(
        makeLifecycle({
          law_kind: 'signed',
          derived: { status: 'pending_signature', day_of_ten: 3, deadline_date: '2026-07-10', becomes_law_on: '2026-07-11' },
        }),
      ),
    ).toBe('became_law_signed')
  })

  it('maps derived law_unsigned_derived', () => {
    expect(
      deriveTerminalStatus(
        makeLifecycle({
          presented_date: '2026-06-29',
          derived: {
            status: 'law_unsigned_derived',
            day_of_ten: null,
            deadline_date: '2026-07-10',
            becomes_law_on: '2026-07-11',
          },
        }),
      ),
    ).toBe('became_law_unsigned')
  })

  it('returns null when lifecycle is null', () => {
    expect(deriveTerminalStatus(null)).toBeNull()
  })

  it('lets became_law_date beat a stale vetoed law_kind', () => {
    expect(
      deriveTerminalStatus(
        makeLifecycle({
          law_kind: 'vetoed',
          vetoed_date: '2026-05-01',
          became_law_date: '2026-05-20',
        }),
      ),
    ).toBe('became_law')
  })
})

describe('getBillLifecycleStages', () => {
  it('builds the HR 6644 unsigned-law pipeline', () => {
    const item = makeFeedItem({
      bill: {
        congress: 119,
        type: 'HR',
        number: 6644,
        title: '21st Century ROAD to Housing Act',
      },
      passage_votes: hr6644Votes,
      latest_passage_date: '2026-06-24',
      lifecycle: makeLifecycle({
        introduced_date: '2025-12-11',
        presented_date: '2026-06-29',
        became_law_date: '2026-07-11',
        law_kind: 'law_unsigned',
        public_law: 'Public Law 119-42',
        latest_action_date: '2026-07-11',
        latest_action_text: 'Became Public Law without signature.',
        derived: { status: null, day_of_ten: null, deadline_date: null, becomes_law_on: null },
      }),
    })

    const { terminalStatus, stages } = getBillLifecycleStages(item)
    expect(terminalStatus).toBe('became_law_unsigned')
    expect(stages.map((s) => [s.key, s.state, s.date, s.label])).toEqual([
      ['introduced', 'done', '2025-12-11', 'Introduced'],
      ['house', 'done', '2026-05-14', 'Passed House'],
      ['senate', 'done', '2026-06-24', 'Passed Senate'],
      ['to_president', 'done', '2026-06-29', 'To President'],
      ['outcome', 'done', '2026-07-11', 'Became law — unsigned'],
    ])
    expect(stages[4]?.detail).toContain("without the President's signature")
    expect(stages[4]?.detail).toContain('Public Law 119-42')
  })

  it('uses day-after-deadline when became_law_date is missing for derived unsigned law', () => {
    const item = makeFeedItem({
      passage_votes: hr6644Votes,
      lifecycle: makeLifecycle({
        introduced_date: '2025-12-11',
        presented_date: '2026-06-29',
        derived: {
          status: 'law_unsigned_derived',
          day_of_ten: null,
          deadline_date: '2026-07-10',
          becomes_law_on: '2026-07-11',
        },
      }),
    })

    const { terminalStatus, stages } = getBillLifecycleStages(item)
    expect(terminalStatus).toBe('became_law_unsigned')
    expect(stages[4]).toMatchObject({
      label: 'Became law — unsigned',
      date: '2026-07-11',
      state: 'done',
    })
  })

  it('builds a signed-into-law pipeline', () => {
    const item = makeFeedItem({
      passage_votes: hr6644Votes,
      lifecycle: makeLifecycle({
        introduced_date: '2025-01-10',
        presented_date: '2026-03-01',
        signed_date: '2026-03-05',
        became_law_date: '2026-03-05',
        law_kind: 'signed',
        public_law: 'Public Law 119-10',
      }),
    })

    const { terminalStatus, stages } = getBillLifecycleStages(item)
    expect(terminalStatus).toBe('became_law_signed')
    expect(stages[4]).toMatchObject({
      label: 'Signed into law',
      date: '2026-03-05',
      state: 'done',
    })
  })

  it('builds a vetoed pipeline', () => {
    const item = makeFeedItem({
      passage_votes: hr6644Votes,
      lifecycle: makeLifecycle({
        introduced_date: '2025-01-10',
        presented_date: '2026-03-01',
        vetoed_date: '2026-03-08',
        law_kind: 'vetoed',
      }),
    })

    const { terminalStatus, stages } = getBillLifecycleStages(item)
    expect(terminalStatus).toBe('vetoed')
    expect(stages[4]).toMatchObject({
      label: 'Vetoed',
      date: '2026-03-08',
      state: 'failed',
    })
  })

  it('marks pending_signature as current on the President\'s desk', () => {
    const item = makeFeedItem({
      passage_votes: hr6644Votes,
      lifecycle: makeLifecycle({
        introduced_date: '2025-12-11',
        presented_date: '2026-06-29',
        derived: {
          status: 'pending_signature',
          day_of_ten: 4,
          deadline_date: '2026-07-10',
          becomes_law_on: '2026-07-11',
        },
      }),
    })

    const { terminalStatus, stages } = getBillLifecycleStages(item)
    expect(terminalStatus).toBe('pending_signature')
    expect(stages[3]).toMatchObject({ key: 'to_president', state: 'done', date: '2026-06-29' })
    expect(stages[4]).toMatchObject({
      label: "On the President's desk",
      state: 'current',
      date: '2026-06-29',
    })
    expect(stages[4]?.detail).toBe('Day 4 of 10 — becomes law 2026-07-11 if unsigned')
  })

  it('derives stages from votes alone when lifecycle is null', () => {
    const item = makeFeedItem({
      passage_votes: hr6644Votes,
      lifecycle: null,
    })

    const { terminalStatus, stages } = getBillLifecycleStages(item)
    expect(terminalStatus).toBeNull()
    expect(stages.map((s) => [s.key, s.state])).toEqual([
      ['introduced', 'done'],
      ['house', 'done'],
      ['senate', 'done'],
      ['to_president', 'current'],
      ['outcome', 'pending'],
    ])
    expect(stages[3]?.label).toBe('To President')
  })

  it('infers both chambers passed when the bill reached the President despite missing votes', () => {
    // Only a House vote is in the lookback window, but the bill became law,
    // so the Senate stage must render as done rather than pending.
    const item = makeFeedItem({
      passage_votes: [hr6644Votes[0]!],
      lifecycle: makeLifecycle({
        introduced_date: '2025-12-11',
        presented_date: '2026-06-29',
        became_law_date: '2026-07-11',
        law_kind: 'law_unsigned',
      }),
    })

    const { stages } = getBillLifecycleStages(item)
    expect(stages.find((s) => s.key === 'senate')?.state).toBe('done')
    expect(stages.find((s) => s.key === 'house')?.state).toBe('done')
  })

  it('handles a House-only bill with Senate still pending', () => {
    const item = makeFeedItem({
      passage_votes: [hr6644Votes[0]!],
      lifecycle: makeLifecycle({ introduced_date: '2025-12-11' }),
    })

    const { stages } = getBillLifecycleStages(item)
    expect(stages.map((s) => [s.key, s.state])).toEqual([
      ['introduced', 'done'],
      ['house', 'done'],
      ['senate', 'current'],
      ['to_president', 'pending'],
      ['outcome', 'pending'],
    ])
  })

  it('marks a chamber failed when it only has failed votes', () => {
    const item = makeFeedItem({
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Passage of the Bill',
          result: 'Failed',
          yeas: 198,
          nays: 230,
          date: '2026-06-04',
        },
      ],
      lifecycle: makeLifecycle({ introduced_date: '2026-01-01' }),
    })

    const { stages } = getBillLifecycleStages(item)
    expect(stages.find((s) => s.key === 'house')).toMatchObject({
      state: 'failed',
      date: '2026-06-04',
    })
    expect(stages.find((s) => s.key === 'senate')?.state).toBe('current')
  })

  it('upgrades a lookback-only failed chamber to done once the bill reached the President', () => {
    const item = makeFeedItem({
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Passage of the Bill',
          result: 'Failed',
          yeas: 198,
          nays: 230,
          date: '2026-01-04',
        },
      ],
      lifecycle: makeLifecycle({
        introduced_date: '2025-12-11',
        presented_date: '2026-06-29',
      }),
    })

    const { stages } = getBillLifecycleStages(item)
    expect(stages.find((s) => s.key === 'house')?.state).toBe('done')
    expect(stages.find((s) => s.key === 'senate')?.state).toBe('done')
  })
})
