import { describe, expect, it } from 'vitest'

import { getRevealAction, getRevealActionLabel } from './gameUi'

describe('gameUi', () => {
  it('returns restart after a wrong streak guess', () => {
    expect(getRevealAction('reveal', 'streak', false)).toBe('restart')
  })

  it('returns next after a correct guess or in timed mode', () => {
    expect(getRevealAction('reveal', 'streak', true)).toBe('next')
    expect(getRevealAction('reveal', 'timed', false)).toBe('next')
  })

  it('returns null outside reveal phase', () => {
    expect(getRevealAction('playing', 'streak', true)).toBeNull()
  })

  it('labels reveal actions', () => {
    expect(getRevealActionLabel('next')).toBe('Next bill')
    expect(getRevealActionLabel('restart')).toBe('Try again')
  })
})
