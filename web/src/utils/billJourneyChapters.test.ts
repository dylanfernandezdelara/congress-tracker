import { describe, expect, it } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import { buildBillJourney } from './billJourney'
import { groupJourneyChapters } from './billJourneyChapters'

describe('groupJourneyChapters', () => {
  it('collapses a House committee run and same-day floor into chamber chapters', () => {
    const chapters = groupJourneyChapters(
      buildBillJourney(
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
                date: '2026-01-10',
                label: 'Sent to Energy and Commerce Committee → Health Subcommittee',
                activity_key: 'sent',
                chamber: 'House',
                committee_name: 'Health Subcommittee',
                system_code: 'hsif14',
                parent_system_code: 'hsif00',
                is_subcommittee: true,
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
                label: 'Committee advanced the bill from Energy and Commerce Committee → Health Subcommittee',
                activity_key: 'advanced',
                chamber: 'House',
                committee_name: 'Health Subcommittee',
                system_code: 'hsif14',
                parent_system_code: 'hsif00',
                is_subcommittee: true,
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
      ),
    )

    expect(chapters.map((chapter) => chapter.id)).toEqual(['House', 'Senate'])
    expect(chapters[0]?.runs.map((run) => run.beats.map((beat) => beat.text))).toEqual([
      ['Referred', 'Health', 'Hearings', 'Advanced 47–0'],
      ['Calendar'],
      ['Rule 218–210'],
      ['Passed 220–213'],
    ])
    expect(chapters[0]?.runs[0]?.subject).toBe('Energy and Commerce')
    expect(chapters[0]?.runs[0]?.beats.map((beat) => beat.date)).toEqual([
      '2026-01-10',
      '2026-01-10',
      '2026-03-01',
      '2026-03-15',
    ])
    expect(chapters[1]?.runs[0]?.beats.map((beat) => beat.text)).toEqual(['Received'])
  })

  it('keeps a failed passage beat', () => {
    const chapters = groupJourneyChapters(
      buildBillJourney(
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
      ),
    )
    const beat = chapters[0]?.runs[0]?.beats[0]
    expect(beat?.text).toBe('Failed 198–230')
    expect(beat?.failed).toBe(true)
  })

  it('gives a second House visit its own chapter key', () => {
    const chapters = groupJourneyChapters([
      {
        id: 'h1',
        date: '2026-01-10',
        kind: 'committee',
        label: 'Sent to Energy and Commerce',
        chamber: 'House',
        state: 'done',
        tally: null,
        activity_key: 'sent',
        committee_name: 'Energy and Commerce Committee',
        system_code: 'hsif00',
        parent_system_code: null,
        is_subcommittee: false,
      },
      {
        id: 's1',
        date: '2026-02-01',
        kind: 'received',
        label: 'Received in the Senate',
        chamber: 'Senate',
        state: 'done',
        tally: null,
      },
      {
        id: 'h2',
        date: '2026-03-01',
        kind: 'committee',
        label: 'Sent to Energy and Commerce',
        chamber: 'House',
        state: 'done',
        tally: null,
        activity_key: 'sent',
        committee_name: 'Energy and Commerce Committee',
        system_code: 'hsif00',
        parent_system_code: null,
        is_subcommittee: false,
      },
    ])
    expect(chapters.map((chapter) => chapter.id)).toEqual(['House', 'Senate', 'House'])
    expect(chapters.map((chapter) => chapter.key)).toEqual(['House-0', 'Senate-1', 'House-2'])
  })
})
