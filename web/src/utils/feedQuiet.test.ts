import { describe, expect, it } from 'vitest'

import {
  feedQuietCopy,
  floorActivityDate,
  floorStatusLabel,
  latestPassageDateAmong,
  timelineFloorChrome,
} from './feedQuiet'

describe('latestPassageDateAmong', () => {
  it('picks the max vote-only passage day and skips executive timestamps', () => {
    expect(
      latestPassageDateAmong([
        {
          latest_passage_date: '2026-04-10',
        },
        {
          latest_passage_date: null,
        },
        {
          latest_passage_date: '2026-08-08T16:00:00.000Z',
        },
      ]),
    ).toBe('2026-08-08')
  })

  it('returns null when no row has a passage date', () => {
    expect(latestPassageDateAmong([{ latest_passage_date: null }])).toBeNull()
    expect(latestPassageDateAmong([])).toBeNull()
  })
})

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

describe('floorStatusLabel', () => {
  const now = new Date('2026-08-25T20:00:00.000Z')

  it('names working, in-session, and recess floors', () => {
    expect(floorStatusLabel('2026-08-24', now)).toBe('Working')
    expect(floorStatusLabel('2026-08-21', now)).toBe('In session')
    expect(floorStatusLabel('2026-08-08', now)).toBe('In recess')
    expect(floorStatusLabel(null, now)).toBeNull()
  })
})

describe('floorActivityDate', () => {
  it('keeps House status on House passage dates', () => {
    expect(
      floorActivityDate({
        passageDay: '2026-04-10',
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        confirmationDates: ['2026-08-24'],
        chamber: 'House',
      }),
    ).toBe('2026-07-23')
  })

  it('lets Senate confirmations count as floor work', () => {
    expect(
      floorActivityDate({
        passageDay: '2026-08-08',
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        confirmationDates: ['2026-08-24'],
        chamber: 'Senate',
      }),
    ).toBe('2026-08-24')
  })

  it('does not treat a bicameral bill latest_passage_date as a House floor day', () => {
    expect(
      floorActivityDate({
        passageDay: '2026-08-08',
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        chamber: 'House',
      }),
    ).toBe('2026-07-23')
  })

  it('does not fall back to bill latest_passage_date when House dates are missing', () => {
    expect(
      floorActivityDate({
        passageDay: '2026-08-08',
        senateLast: '2026-08-08',
        chamber: 'House',
      }),
    ).toBeNull()
  })
})

describe('timelineFloorChrome', () => {
  const now = new Date('2026-08-25T20:00:00.000Z')

  it('keeps passage through-copy while confirmations can mark Working', () => {
    expect(
      timelineFloorChrome({
        items: [{ latest_passage_date: '2026-08-08' }],
        chamber: null,
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        confirmationVoteDates: ['2026-08-24'],
        now,
      }),
    ).toEqual({
      throughLabel: 'Aug 8',
      notice: 'No new House or Senate passage votes since Aug 8.',
      statusLabel: 'Working',
    })
  })

  it('drops the quiet notice when the timeline is searched or filtered', () => {
    expect(
      timelineFloorChrome({
        items: [{ latest_passage_date: '2026-08-08' }],
        chamber: null,
        through: 'page',
        now,
      }),
    ).toEqual({
      throughLabel: 'Aug 8',
      notice: null,
      statusLabel: 'In recess',
    })
  })

  it('uses session passage watermarks so page-1 ranking cannot hide the floor date', () => {
    expect(
      timelineFloorChrome({
        items: [{ latest_passage_date: '2026-04-10' }],
        chamber: null,
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        now,
      }),
    ).toEqual({
      throughLabel: 'Aug 8',
      notice: 'No new House or Senate passage votes since Aug 8.',
      statusLabel: 'In recess',
    })
  })

  it('keeps a searched through-date on the loaded page', () => {
    expect(
      timelineFloorChrome({
        items: [{ latest_passage_date: '2026-04-10' }],
        chamber: null,
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        through: 'page',
        now,
      }),
    ).toEqual({
      throughLabel: 'Apr 10',
      notice: null,
      statusLabel: 'In recess',
    })
  })

  it('dates a House-filtered floor from House votes, not a Senate passage on the same bill', () => {
    expect(
      timelineFloorChrome({
        items: [
          {
            latest_passage_date: '2026-08-08',
            passage_votes: [{ chamber: 'Senate', date: '2026-08-08' }],
          },
        ],
        chamber: 'House',
        houseLast: '2026-07-23',
        senateLast: '2026-08-08',
        now,
      }),
    ).toEqual({
      throughLabel: 'Jul 23',
      notice: 'No new House passage votes since Jul 23.',
      statusLabel: 'In recess',
    })
  })
})
