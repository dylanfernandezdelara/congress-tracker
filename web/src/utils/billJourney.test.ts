import { describe, expect, it } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import { buildBillJourney, journeyKindLabel } from './billJourney'

describe('buildBillJourney', () => {
  it('interleaves committee, floor, companion, passage, and law milestones', () => {
    const events = buildBillJourney(
      makeFeedItem({
        bill: { congress: 119, type: 'HR', number: 1, title: 'Energy Act' },
        passage_votes: [
          {
            chamber: 'House',
            congress: 119,
            session: 2,
            roll_number: 9001,
            question: 'On Passage',
            result: 'Passed',
            yeas: 220,
            nays: 213,
            date: '2026-04-02',
          },
        ],
        companion_votes: [
          {
            chamber: 'House',
            congress: 119,
            session: 2,
            roll_number: 9005,
            question: 'On Agreeing to the Resolution',
            result: 'Passed',
            yeas: 218,
            nays: 210,
            date: '2026-04-02',
          },
        ],
        latest_passage_date: '2026-04-02',
        latest_activity_date: '2026-04-02',
        lifecycle: {
          introduced_date: '2026-01-03',
          presented_date: '2026-04-10',
          signed_date: '2026-04-12',
          vetoed_date: null,
          became_law_date: '2026-04-12',
          law_kind: 'signed',
          public_law: '119-1',
          latest_action_date: '2026-04-12',
          latest_action_text: 'Became Public Law No: 119-1.',
          derived: {
            status: null,
            day_of_ten: null,
            deadline_date: null,
            becomes_law_on: null,
          },
        },
        process: {
          current_status: 'cleared_committee',
          current_label: 'Cleared Energy and Commerce · waiting for a chamber vote',
          stages: [
            {
              date: '2026-01-10',
              label: 'Sent to Energy and Commerce Committee',
              activity_key: 'sent',
              chamber: 'House',
              committee_name: 'Energy and Commerce Committee',
              system_code: 'hsif00',
              parent_system_code: null,
              is_subcommittee: false,
              tally_text: null,
            },
            {
              date: '2026-03-01',
              label: 'Committee held hearings in Energy and Commerce Committee',
              activity_key: 'hearings',
              chamber: 'House',
              committee_name: 'Energy and Commerce Committee',
              system_code: 'hsif00',
              parent_system_code: null,
              is_subcommittee: false,
              tally_text: null,
            },
            {
              date: '2026-03-15',
              label: 'Committee advanced the bill from Energy and Commerce Committee (47-0)',
              activity_key: 'advanced',
              chamber: 'House',
              committee_name: 'Energy and Commerce Committee',
              system_code: 'hsif00',
              parent_system_code: null,
              is_subcommittee: false,
              tally_text: '47-0',
            },
          ],
          floor_actions: [
            {
              date: '2026-03-20',
              key: 'calendar',
              label: 'Placed on the House calendar',
              chamber: 'House',
              tally_text: null,
            },
            {
              date: '2026-04-03',
              key: 'received',
              label: 'Received in the Senate',
              chamber: 'Senate',
              tally_text: null,
            },
          ],
        },
      }),
    )

    expect(events.map((e) => e.kind)).toEqual([
      'introduced',
      'committee',
      'committee',
      'committee',
      'calendar',
      'companion_vote',
      'passage_vote',
      'received',
      'to_president',
      'outcome',
    ])
    expect(events[0]?.label).toBe('Introduced')
    expect(events.find((e) => e.kind === 'committee' && e.tally === '47-0')?.label).toMatch(
      /Energy and Commerce/,
    )
    expect(events.find((e) => e.kind === 'passage_vote')?.label).toBe('Passed the House 220–213')
    expect(events.find((e) => e.kind === 'received')?.label).toBe('Received in the Senate')
    expect(events[events.length - 1]?.label).toBe('Signed into law')
  })

  it('drops a floor cloture row when a cloture roll already exists that day', () => {
    const events = buildBillJourney(
      makeFeedItem({
        companion_votes: [
          {
            chamber: 'Senate',
            congress: 119,
            session: 2,
            roll_number: 12,
            question: 'On the Cloture Motion',
            result: 'Agreed to',
            yeas: 60,
            nays: 37,
            date: '2026-06-01',
          },
        ],
        process: {
          current_status: 'cleared_committee',
          current_label: null,
          stages: [],
          floor_actions: [
            {
              date: '2026-06-01',
              key: 'cloture',
              label: 'Cloture in the Senate (60-37)',
              chamber: 'Senate',
              tally_text: '60-37',
            },
          ],
        },
      }),
    )

    const cloture = events.filter((e) => e.kind === 'cloture')
    expect(cloture).toHaveLength(1)
    expect(cloture[0]?.label).toMatch(/On the Cloture Motion/)
  })

  it('marks a failed passage vote', () => {
    const events = buildBillJourney(
      makeFeedItem({
        passage_votes: [
          {
            chamber: 'House',
            congress: 119,
            session: 2,
            roll_number: 1,
            question: 'On Passage',
            result: 'Failed',
            yeas: 198,
            nays: 230,
            date: '2026-02-01',
          },
        ],
      }),
    )
    const passage = events.find((e) => e.kind === 'passage_vote')
    expect(passage?.state).toBe('failed')
    expect(passage?.label).toBe('Failed in the House 198–230')
  })
})

describe('journeyKindLabel', () => {
  it('names committee and floor kinds for the timeline rail', () => {
    expect(journeyKindLabel('committee')).toBe('Committee')
    expect(journeyKindLabel('passage_vote')).toBe('Passage')
    expect(journeyKindLabel('cloture')).toBe('Cloture')
  })
})
