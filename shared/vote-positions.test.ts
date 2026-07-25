import { describe, expect, it } from 'vitest'
import { normalizeVotePosition } from './vote-positions'

describe('normalizeVotePosition', () => {
  it('maps the yea vocabulary used by House and Senate sources', () => {
    for (const position of ['Yea', 'Aye', 'Yes', 'yea', ' YEA ']) {
      expect(normalizeVotePosition(position)).toBe('yea')
    }
  })

  it('maps the nay vocabulary', () => {
    for (const position of ['Nay', 'No', 'nay', ' NO ']) {
      expect(normalizeVotePosition(position)).toBe('nay')
    }
  })

  it('never scores an absence as a vote', () => {
    // "Not Voting" contains "no"; treating it as Nay invents defectors out of
    // members who simply were not present.
    for (const position of ['Not Voting', 'not voting', 'No Vote', 'Absent', 'Excused']) {
      expect(normalizeVotePosition(position)).toBe('other')
    }
  })

  it('treats present votes as neither side', () => {
    for (const position of ['Present', 'Present - Announced']) {
      expect(normalizeVotePosition(position)).toBe('other')
    }
  })

  it('returns other for empty or unrecognized positions', () => {
    expect(normalizeVotePosition('')).toBe('other')
    expect(normalizeVotePosition('   ')).toBe('other')
    expect(normalizeVotePosition('Guilty')).toBe('other')
  })

  it('does not match yea or nay inside unrelated words', () => {
    expect(normalizeVotePosition('Nomination')).toBe('other')
    expect(normalizeVotePosition('Noes')).toBe('other')
  })
})
