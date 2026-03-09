import { describe, expect, it } from 'vitest'
import type { ActivityIndexResponse, BillAnalysis, SessionOverview, VoteLedger } from '../api'
import { buildBillTimelineVM, buildHomepageSpotlightVM, buildSwingFrequencyIndex, toActionCards, toInsightCards, type SwingFrequencyIndex } from './homeViewModel'

const emptySwingIndex: SwingFrequencyIndex = { totalCloseVotes: 0, profiles: new Map() }

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
    const cards = toActionCards(vm, emptySwingIndex)

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
    const cards = toActionCards(vm, emptySwingIndex)

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
    const cards = toActionCards(vm, emptySwingIndex)

    expect(cards).toHaveLength(1)
    expect(cards[0].context).not.toMatch(/Official sources|limited detail|not specified/i)
  })

  it('populates swingSenators with correct swingPct on close votes', () => {
    const overview = makeOverview(1, '2026-01-06')
    const memberVotes: Record<string, string> = {}
    for (let i = 0; i < 26; i++) memberVotes[`D${String(i).padStart(3, '0')}`] = 'Yea'
    for (let i = 0; i < 24; i++) memberVotes[`R${String(i).padStart(3, '0')}`] = 'Nay'
    memberVotes['A000001'] = 'Nay'
    memberVotes['B000001'] = 'Yea'

    const extendedSenators = [
      ...overview.senators,
      ...Array.from({ length: 26 }, (_, i) => ({
        bioguide_id: `D${String(i).padStart(3, '0')}`,
        name: `Dem${i}, Senator`,
        party: 'D',
        state: 'CA',
        votes_cast: 1,
        votes_missed: 0,
        party_defections: 0,
        alignment_pct: 100,
      })),
      ...Array.from({ length: 24 }, (_, i) => ({
        bioguide_id: `R${String(i).padStart(3, '0')}`,
        name: `Rep${i}, Senator`,
        party: 'R',
        state: 'TX',
        votes_cast: 1,
        votes_missed: 0,
        party_defections: 0,
        alignment_pct: 100,
      })),
    ]
    const closeOverview: SessionOverview = { ...overview, senators: extendedSenators }

    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-06T00:00:00Z',
      total_votes: 1,
      entries: [{
        vote_number: 701,
        vote_date: '2026-01-06',
        title: 'S. 700 vote',
        question: 'On Passage of the Bill',
        result: 'Passed',
        issue: 'S. 700',
        member_votes: memberVotes,
      }],
    }

    const swingIdx = buildSwingFrequencyIndex(ledger, closeOverview, null)
    const vm = buildBillTimelineVM(ledger, closeOverview, null, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toActionCards(vm, swingIdx)

    expect(cards).toHaveLength(1)
    expect(cards[0].isCloseVote).toBe(true)
    expect(cards[0].swingSenators.length).toBeGreaterThan(0)

    const alphaSwing = cards[0].swingSenators.find((s) => s.name === 'Alpha')
    expect(alphaSwing).toBeTruthy()
    expect(alphaSwing!.voteCast).toBe('Nay')
    expect(alphaSwing!.swingPct).toBe(100)
  })
})

describe('toInsightCards', () => {
  it('derives party positions from vote breakdown', () => {
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
    const cards = toInsightCards(vm, emptySwingIndex)

    expect(cards).toHaveLength(1)
    expect(cards[0].partyPositions.length).toBeGreaterThan(0)

    const dPos = cards[0].partyPositions.find((p) => p.party === 'D')
    expect(dPos).toBeTruthy()
    expect(dPos!.stance).toBe('support')
    expect(dPos!.evidencePoints.length).toBeGreaterThan(0)

    const rPos = cards[0].partyPositions.find((p) => p.party === 'R')
    expect(rPos).toBeTruthy()
    expect(rPos!.stance).toBe('oppose')
  })

  it('merges LLM analysis positions when available', () => {
    const analysisWithPositions: BillAnalysis = {
      plain_title: 'Test Act',
      plain_summary: 'A test measure',
      key_provisions: [],
      why_it_matters: 'testing',
      hidden_provisions: null,
      significance: 'medium',
      significance_reason: 'test',
      category: 'Testing',
      affects: [],
      party_positions: [
        {
          party: 'D',
          stance: 'support',
          evidence_points: ['Sponsors include senior Democrats'],
          inferred_rationale: ['Aligns with Democratic healthcare agenda'],
          confidence: 'medium',
        },
      ],
      benefit_map: [
        {
          group: 'Medicare recipients',
          expected_effect: 'benefit',
          evidence_refs: [
            {
              source_endpoint: 'summaries',
              source_ref: 'summary_evidence:1',
              quote: 'Coverage expands for Medicare recipients through the end of FY 2028.',
            },
          ],
        },
        {
          group: 'Small businesses',
          expected_effect: 'burden',
          evidence_refs: [{ source_endpoint: 'summaries', source_ref: 'summary_evidence:2' }],
        },
      ],
      analysis_quality: {
        evidence_coverage: 'partial',
        inference_used: true,
        confidence_reason: 'Some inference required.',
      },
      likely_reasons: [
        {
          actor: 'D',
          category: 'federalism',
          reason: 'Likely concern that federal intervention overrides local D.C. tax policy decisions.',
          confidence: 'medium',
          inference_label: 'inference',
          evidence_refs: [
            {
              source_endpoint: 'summaries',
              source_ref: 'summary_evidence:1',
              quote: 'This joint resolution nullifies legislation enacted by the Council of the District of Columbia.',
            },
          ],
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
          bill: {
            congress: 119,
            type: 'S',
            number: '500',
            title: 'Test Act',
            analysis: analysisWithPositions,
          },
        },
      ],
    }

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

    const vm = buildBillTimelineVM(ledger, makeOverview(1, '2026-01-06'), activities, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toInsightCards(vm, emptySwingIndex)

    expect(cards).toHaveLength(1)
    const card = cards[0]

    expect(card.hasInference).toBe(true)
    const dPos = card.partyPositions.find((p) => p.party === 'D')
    expect(dPos!.inferredRationale).toContain('Aligns with Democratic healthcare agenda')

    expect(card.beneficiaries.length).toBeGreaterThan(0)
    expect(card.beneficiaries[0].group).toBe('Medicare recipients')
    expect(card.beneficiaries[0].effect).toBe('benefit')
    expect(card.beneficiaries[0].effectLabel).toBe('Benefits')
    expect(card.beneficiaries[0].rationale[0]).toContain('Coverage expands for Medicare recipients')
    const harmedGroup = card.beneficiaries.find((b) => b.effect === 'burden')
    expect(harmedGroup).toBeTruthy()
    expect(harmedGroup!.effectLabel).toBe('Harms')
    expect(harmedGroup!.rationale[0]).toBe('Source: summary_evidence:2')

    expect(card.analysisQuality).toBeTruthy()
    expect(card.analysisQuality!.inference_used).toBe(true)
    expect(card.likelyReasons.length).toBe(1)
    expect(card.likelyReasons[0].actorLabel).toBe('Democrats')
    expect(card.likelyReasons[0].category).toBe('Federalism')
    expect(card.likelyReasons[0].inferenceLabel).toBe('Inference')
    expect(card.likelyReasons[0].evidenceLines[0]).toContain('nullifies legislation enacted')
  })

  it('renders fallback state when no analysis exists', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-06T00:00:00Z',
      total_votes: 1,
      entries: [
        {
          vote_number: 801,
          vote_date: '2026-01-06',
          title: 'S. 800 nomination',
          question: 'On Confirmation',
          result: 'Confirmed',
          issue: 'PN 42',
          member_votes: { A000001: 'Yea', B000001: 'Nay' },
        },
      ],
    }

    const vm = buildBillTimelineVM(ledger, makeOverview(1, '2026-01-06'), null, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toInsightCards(vm, emptySwingIndex)

    expect(cards).toHaveLength(1)
    expect(cards[0].hasInference).toBe(false)
    expect(cards[0].analysisQuality).toBeNull()
    expect(cards[0].partyPositions.length).toBeGreaterThan(0)
    expect(cards[0].partyPositions.every((p) => p.inferredRationale.length === 0)).toBe(true)
    expect(cards[0].beneficiaries.every((b) => b.rationale.length === 0)).toBe(true)
  })

  it('deduplicates and truncates beneficiary rationale lines', () => {
    const longQuote = 'This bill requires covered entities to submit quarterly compliance filings and administrative certifications for every participating location nationwide before reimbursement can be issued.'
    const analysisWithLongRationale: BillAnalysis = {
      plain_title: 'Long Rationale Test',
      plain_summary: 'Testing rationale formatting',
      key_provisions: [],
      why_it_matters: 'test',
      hidden_provisions: null,
      significance: 'medium',
      significance_reason: 'test',
      category: 'Testing',
      affects: [],
      benefit_map: [
        {
          group: 'County clinics',
          expected_effect: 'mixed',
          evidence_refs: [
            { source_endpoint: 'summaries', source_ref: 'summary_evidence:1', quote: longQuote },
            { source_endpoint: 'summaries', source_ref: 'summary_evidence:2', quote: longQuote },
            { source_endpoint: 'summaries', source_ref: 'summary_evidence:3', quote: 'Source systems are upgraded over a 2-year transition period.' },
          ],
        },
      ],
    }

    const activities: ActivityIndexResponse = {
      generated_at: '2026-01-06T00:00:00Z',
      window: { start_date: '2026-01-01', end_date: '2026-01-06' },
      activities: [
        {
          activity_id: 'senate:roll_call_vote:2026-01-06:950',
          source: 'senate',
          type: 'roll_call_vote',
          date: '2026-01-06',
          members: ['A000001', 'B000001'],
          bill: {
            congress: 119,
            type: 'S',
            number: '950',
            title: 'Long Rationale Test',
            analysis: analysisWithLongRationale,
          },
        },
      ],
    }
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-06T00:00:00Z',
      total_votes: 1,
      entries: [
        {
          vote_number: 950,
          vote_date: '2026-01-06',
          title: 'S. 950 vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 950',
          member_votes: { A000001: 'Yea', B000001: 'Nay' },
        },
      ],
    }

    const vm = buildBillTimelineVM(ledger, makeOverview(1, '2026-01-06'), activities, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toInsightCards(vm, emptySwingIndex)
    const rationale = cards[0].beneficiaries[0].rationale

    expect(rationale.length).toBe(2)
    expect(rationale[0].endsWith('...')).toBe(true)
    expect(rationale[1]).toContain('Source systems are upgraded')
  })

  it('marks status labels correctly', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-06T00:00:00Z',
      total_votes: 1,
      entries: [
        {
          vote_number: 901,
          vote_date: '2026-01-06',
          title: 'S. 900 vote',
          question: 'On Passage of the Bill',
          result: 'Rejected',
          issue: 'S. 900',
          member_votes: { A000001: 'Nay', B000001: 'Nay' },
        },
      ],
    }

    const vm = buildBillTimelineVM(ledger, makeOverview(1, '2026-01-06'), null, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toInsightCards(vm, emptySwingIndex)

    expect(cards).toHaveLength(1)
    expect(cards[0].status).toBe('rejected')
    expect(cards[0].statusLabel).toBe('Rejected')
  })

  it('labels all inference lines when present', () => {
    const analysisWithInference: BillAnalysis = {
      plain_title: 'Inference Test',
      plain_summary: 'Testing inference labeling',
      key_provisions: [],
      why_it_matters: 'test',
      hidden_provisions: null,
      significance: 'medium',
      significance_reason: 'test',
      category: 'Testing',
      affects: [],
      party_positions: [
        {
          party: 'R',
          stance: 'oppose',
          evidence_points: [],
          inferred_rationale: ['Likely opposes due to spending concerns'],
          confidence: 'low',
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
          bill: {
            congress: 119,
            type: 'S',
            number: '500',
            title: 'Inference Test Act',
            analysis: analysisWithInference,
          },
        },
      ],
    }

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

    const vm = buildBillTimelineVM(ledger, makeOverview(1, '2026-01-06'), activities, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toInsightCards(vm, emptySwingIndex)

    expect(cards).toHaveLength(1)
    expect(cards[0].hasInference).toBe(true)
    const rPos = cards[0].partyPositions.find((p) => p.party === 'R')
    expect(rPos!.inferredRationale.length).toBeGreaterThan(0)
    // Vote-derived confidence ('medium' from 1 voter) is not downgraded by analysis confidence
    expect(rPos!.confidence).toBe('medium')
  })

  it('handles tie votes with mixed stance', () => {
    const overview = makeOverview(1, '2026-01-06')
    const extSenators = [
      ...overview.senators,
      { bioguide_id: 'A000002', name: 'Alpha2, Ada2', party: 'D', state: 'CA', votes_cast: 1, votes_missed: 0, party_defections: 0, alignment_pct: 100 },
      { bioguide_id: 'B000002', name: 'Bravo2, Ben2', party: 'R', state: 'FL', votes_cast: 1, votes_missed: 0, party_defections: 0, alignment_pct: 100 },
    ]
    const tiedOverview: SessionOverview = { ...overview, senators: extSenators }

    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-06T00:00:00Z',
      total_votes: 1,
      entries: [
        {
          vote_number: 701,
          vote_date: '2026-01-06',
          title: 'S. 700 vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 700',
          member_votes: { A000001: 'Yea', A000002: 'Nay', B000001: 'Yea', B000002: 'Nay' },
        },
      ],
    }

    const vm = buildBillTimelineVM(ledger, tiedOverview, null, { windowDays: 7, referenceDate: '2026-01-06' })
    const cards = toInsightCards(vm, emptySwingIndex)

    expect(cards).toHaveLength(1)
    const dPos = cards[0].partyPositions.find((p) => p.party === 'D')
    expect(dPos).toBeTruthy()
    expect(dPos!.stance).toBe('mixed')
  })
})



describe('buildHomepageSpotlightVM', () => {
  it('prioritizes war-powers/Iran relevance over less critical topics', () => {
    const ledger: VoteLedger = {
      congress: 119,
      session: 2,
      generated_at: '2026-01-20T00:00:00Z',
      total_votes: 2,
      entries: [
        {
          vote_number: 801,
          vote_date: '2026-01-20',
          title: 'S.J.Res. 55 vote',
          question: 'On Passage of the Joint Resolution',
          result: 'Passed',
          issue: 'S.J.Res. 55',
          member_votes: { A000001: 'Yea', B000001: 'Nay' },
        },
        {
          vote_number: 802,
          vote_date: '2026-01-20',
          title: 'S. 802 vote',
          question: 'On Passage of the Bill',
          result: 'Passed',
          issue: 'S. 802',
          member_votes: { A000001: 'Yea', B000001: 'Nay' },
        },
      ],
    }

    const activities: ActivityIndexResponse = {
      generated_at: '2026-01-20T00:00:00Z',
      window: { start_date: '2026-01-15', end_date: '2026-01-20' },
      activities: [
        {
          activity_id: 'senate:roll_call_vote:2026-01-20:801',
          source: 'senate',
          type: 'roll_call_vote',
          date: '2026-01-20',
          members: ['A000001', 'B000001'],
          bill: {
            congress: 119,
            type: 'S.J.Res.',
            number: '55',
            title: 'War Powers Resolution on Iran',
            policy_area: 'Armed forces and national security',
            analysis: {
              plain_title: 'War Powers Resolution on Iran',
              plain_summary: 'Limits unauthorized military action involving Iran.',
              key_provisions: [],
              why_it_matters: 'test',
              hidden_provisions: null,
              significance: 'high',
              significance_reason: 'test',
              category: 'National Security',
              affects: [],
            },
          },
        },
        {
          activity_id: 'senate:roll_call_vote:2026-01-20:802',
          source: 'senate',
          type: 'roll_call_vote',
          date: '2026-01-20',
          members: ['A000001', 'B000001'],
          bill: {
            congress: 119,
            type: 'S',
            number: '802',
            title: 'Post Office Naming Act',
            policy_area: 'Government operations and politics',
            analysis: {
              plain_title: 'Post Office Naming Act',
              plain_summary: 'Names a local post office building.',
              key_provisions: [],
              why_it_matters: 'test',
              hidden_provisions: null,
              significance: 'low',
              significance_reason: 'test',
              category: 'Government Operations',
              affects: [],
            },
          },
        },
      ],
    }

    const bills = buildBillTimelineVM(ledger, makeOverview(2, '2026-01-20'), activities, {
      windowDays: 7,
      referenceDate: '2026-01-20',
      totalBudget: 5,
      keyBudget: 3,
    })

    const spotlight = buildHomepageSpotlightVM(bills, 2)

    expect(spotlight).toHaveLength(2)
    expect(spotlight[0].title).toMatch(/Iran|War Powers/i)
    expect(spotlight[0].relevanceScore).toBeGreaterThan(spotlight[1].relevanceScore)
  })
})
