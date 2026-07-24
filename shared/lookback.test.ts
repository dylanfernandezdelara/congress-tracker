import { describe, expect, it } from 'vitest'
import { VOTE_LOOKBACK_DAYS } from './feed-constants'
import { daysAgoLookbackStartIso, inclusiveLookbackStartIso } from './lookback'

describe('lookbackStartIso semantics', () => {
  const asOf = new Date('2026-07-24T15:30:00.000Z')

  it('inclusiveDays counts calendar days ending on asOf (notable-votes style)', () => {
    // 14-day inclusive window: Jul 11 … Jul 24
    expect(inclusiveLookbackStartIso(14, asOf)).toBe('2026-07-11')
    expect(inclusiveLookbackStartIso(1, asOf)).toBe('2026-07-24')
  })

  it('daysAgo subtracts N days (feed/vote lookback style)', () => {
    // VOTE_LOOKBACK_DAYS → start Jul 24 − N = Jun 9 for N=45 (46 inclusive days)
    expect(daysAgoLookbackStartIso(VOTE_LOOKBACK_DAYS, asOf)).toBe('2026-06-09')
    expect(daysAgoLookbackStartIso(VOTE_LOOKBACK_DAYS, asOf)).toBe(
      inclusiveLookbackStartIso(VOTE_LOOKBACK_DAYS + 1, asOf),
    )
  })

  it('documents the historical semantic gap without changing effective windows', () => {
    const notableDays = 14
    expect(inclusiveLookbackStartIso(notableDays, asOf)).toBe('2026-07-11')
    expect(daysAgoLookbackStartIso(VOTE_LOOKBACK_DAYS, asOf)).toBe('2026-06-09')
  })
})
