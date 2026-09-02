import { describe, expect, it } from 'vitest'

import { chamberFloorDetail, feedQuietCopy, timelineFloorChrome } from './feedQuiet'
import { floorChipLabel } from './floorStatusCopy'

describe('feedQuietCopy', () => {
  const now = new Date('2026-08-25T20:00:00.000Z')

  it('returns through-label without a notice for a fresh floor', () => {
    expect(feedQuietCopy('2026-08-24', now)).toEqual({
      throughLabel: 'Aug 24',
      notice: null,
    })
  })

  it('explains a quiet floor instead of looking stuck', () => {
    expect(feedQuietCopy('2026-08-08', now)).toEqual({
      throughLabel: 'Aug 8',
      notice: 'No new House or Senate passage votes since Aug 8.',
    })
  })

  it('names a single chamber when the timeline is filtered', () => {
    expect(feedQuietCopy('2026-08-08', now, 'House')).toEqual({
      throughLabel: 'Aug 8',
      notice: 'No new House passage votes since Aug 8.',
    })
  })

  it('uses the UTC calendar day of a datetime so through-labels stay valid', () => {
    expect(feedQuietCopy('2026-08-08T14:26:00.000Z', now)).toEqual({
      throughLabel: 'Aug 8',
      notice: 'No new House or Senate passage votes since Aug 8.',
    })
  })

  it('returns empty copy when the feed has no passage date', () => {
    expect(feedQuietCopy(null, now)).toEqual({ throughLabel: null, notice: null })
    expect(feedQuietCopy('not-a-date', now)).toEqual({ throughLabel: null, notice: null })
  })
})

describe('chamberFloorDetail status labels', () => {
  const now = new Date('2026-08-25T20:00:00.000Z')

  it('names working, in-session, and recess floors', () => {
    expect(chamberFloorDetail('House', '2026-08-24', now).statusLabel).toBe('Working')
    expect(chamberFloorDetail('House', '2026-08-21', now).statusLabel).toBe('In session')
    expect(chamberFloorDetail('House', '2026-08-08', now).statusLabel).toBe('In recess')
    expect(chamberFloorDetail('House', null, now).statusLabel).toBeNull()
  })
})

describe('timelineFloorChrome', () => {
  const now = new Date('2026-08-25T20:00:00.000Z')

  it('keeps passage through-copy while confirmations can mark Working', () => {
    const chrome = timelineFloorChrome({
      items: [{ passage_votes: [{ chamber: 'Senate', date: '2026-08-08' }] }],
      chamber: null,
      houseLast: '2026-07-23',
      senateLast: '2026-08-08',
      confirmationVoteDates: ['2026-08-24'],
      now,
    })
    expect(chrome).toMatchObject({
      throughLabel: 'Aug 8',
      notice: 'No new House or Senate passage votes since Aug 8.',
      house: { status: 'in_recess' },
      senate: { status: 'working' },
    })
    expect(floorChipLabel(chrome.house, chrome.senate)).toBe('House in recess · Senate working')
  })

  it('drops the quiet notice when the timeline is searched or filtered', () => {
    expect(
      timelineFloorChrome({
        items: [{ passage_votes: [{ chamber: 'Senate', date: '2026-08-08' }] }],
        chamber: null,
        through: 'page',
        now,
      }),
    ).toMatchObject({
      throughLabel: 'Aug 8',
      notice: null,
      house: { status: null },
      senate: { status: null },
    })
  })

  it('uses session passage watermarks so page-1 ranking cannot hide the floor date', () => {
    expect(
      timelineFloorChrome({
        items: [{ passage_votes: [{ chamber: 'Senate', date: '2026-04-10' }] }],
        chamber: null,
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        now,
      }),
    ).toMatchObject({
      throughLabel: 'Aug 8',
      notice: 'No new House or Senate passage votes since Aug 8.',
      house: { status: 'in_recess' },
      senate: { status: 'in_recess' },
    })
  })

  it('does not let a later page roll bump chronological through past session watermarks', () => {
    expect(
      timelineFloorChrome({
        items: [{ passage_votes: [{ chamber: 'Senate', date: '2026-08-24' }] }],
        chamber: null,
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        now,
      }),
    ).toMatchObject({
      throughLabel: 'Aug 8',
      notice: 'No new House or Senate passage votes since Aug 8.',
      house: { status: 'in_recess' },
      senate: { status: 'in_recess' },
    })
  })

  it('keeps a searched through-date on the loaded page', () => {
    expect(
      timelineFloorChrome({
        items: [{ passage_votes: [{ chamber: 'Senate', date: '2026-04-10' }] }],
        chamber: null,
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        through: 'page',
        now,
      }),
    ).toMatchObject({
      throughLabel: 'Apr 10',
      notice: null,
      house: { status: 'in_recess' },
      senate: { status: 'in_recess' },
    })
  })

  it('dates a House-filtered floor from House votes, not a Senate passage on the same bill', () => {
    expect(
      timelineFloorChrome({
        items: [
          {
            passage_votes: [{ chamber: 'Senate', date: '2026-08-08' }],
          },
        ],
        chamber: 'House',
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        now,
      }),
    ).toMatchObject({
      throughLabel: 'Jul 23',
      notice: 'No new House passage votes since Jul 23.',
      house: { status: 'in_recess' },
      senate: { status: 'in_recess' },
    })
  })

  it('dates a House-filtered search from House votes, not bill latest_passage_date', () => {
    expect(
      timelineFloorChrome({
        items: [
          {
            passage_votes: [
              { chamber: 'House', date: '2026-07-23' },
              { chamber: 'Senate', date: '2026-08-08' },
            ],
          },
        ],
        chamber: 'House',
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        through: 'page',
        now,
      }),
    ).toMatchObject({
      throughLabel: 'Jul 23',
      notice: null,
      house: { status: 'in_recess' },
      senate: { status: 'in_recess' },
    })
  })

  it('does not fall back to bill latest_passage_date on a House-filtered search', () => {
    expect(
      timelineFloorChrome({
        items: [
          {
            passage_votes: [{ chamber: 'Senate', date: '2026-08-08' }],
          },
        ],
        chamber: 'House',
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        through: 'page',
        now,
      }),
    ).toMatchObject({
      throughLabel: null,
      notice: null,
      house: { status: 'in_recess' },
      senate: { status: 'in_recess' },
    })
  })

  it('splits House and Senate recess return dates from published calendars', () => {
    const chrome = timelineFloorChrome({
      items: [],
      chamber: null,
      houseLast: '2026-07-23',
      senateLast: '2026-08-08',
      now,
    })
    expect(chrome.house).toMatchObject({
      chamber: 'House',
      status: 'in_recess',
      lastActivityDay: '2026-07-23',
      returnsOn: '2026-08-31',
      periodLabel: 'District work period',
    })
    expect(chrome.senate).toMatchObject({
      chamber: 'Senate',
      status: 'in_recess',
      lastActivityDay: '2026-08-08',
      returnsOn: '2026-09-14',
      periodLabel: 'State work period',
    })
  })

  it('uses today as the House return when the calendar says they are in session', () => {
    const chrome = timelineFloorChrome({
      items: [],
      chamber: null,
      houseLast: '2026-07-23',
      senateLast: '2026-08-08',
      now: new Date('2026-08-31T16:00:00.000Z'),
    })
    expect(chrome.house).toMatchObject({
      status: 'in_recess',
      returnsOn: '2026-08-31',
    })
  })
})
