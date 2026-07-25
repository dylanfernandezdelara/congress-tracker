import { describe, expect, it } from 'vitest'

import type { BillTextChanges } from '../api/types'
import {
  billTextChangesExplanation,
  billVersionPhrase,
  formatProvisionLabel,
} from './billTextVersions'

describe('billVersionPhrase', () => {
  it('translates Congress.gov version labels to plain English', () => {
    expect(billVersionPhrase('Reported in House')).toBe('reported by committee')
    expect(billVersionPhrase('Engrossed in House')).toBe('passed by the House')
    expect(billVersionPhrase('Referred in Senate')).toBe('received in the Senate')
  })

  it('passes through unknown labels instead of guessing', () => {
    expect(billVersionPhrase('Star Print')).toBe('Star Print')
  })

  it('falls back when the summarized version is unknown', () => {
    expect(billVersionPhrase(null)).toBe('an earlier version')
  })
})

describe('formatProvisionLabel', () => {
  it('renders bill and inserted-code section numbers', () => {
    expect(formatProvisionLabel('3.')).toBe('Sec. 3')
    expect(formatProvisionLabel('303A.')).toBe('Sec. 303A')
  })

  it('handles a missing label', () => {
    expect(formatProvisionLabel('  ')).toBe('New section')
  })
})

describe('billTextChangesExplanation', () => {
  const changes: BillTextChanges = {
    summary_version: 'Reported in House',
    summary_version_date: '2026-02-03',
    latest_version: 'Engrossed in House',
    latest_version_date: '2026-07-22',
    added_provisions: [{ label: '3.', heading: 'Requiring voters to provide photo identification' }],
    more_added_count: 0,
  }

  it('names both versions so readers know what the summary covers', () => {
    expect(billTextChangesExplanation(changes)).toBe(
      'The summary above describes this bill reported by committee (Feb 3, 2026).' +
        ' The text passed by the House on Jul 22, 2026 also contains:',
    )
  })

  it('omits the summary date when it is unknown', () => {
    expect(
      billTextChangesExplanation({ ...changes, summary_version_date: null }),
    ).toContain('describes this bill reported by committee.')
  })
})
