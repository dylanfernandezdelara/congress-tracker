import { describe, expect, it } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import { getFeedRowStatus } from './feedRowStatus'
import { readableMemberName } from './sponsorLabels'

describe('getFeedRowStatus', () => {
  it('says what happened in one phrase with the party split', () => {
    const base = makeFeedItem()
    const vote = base.passage_votes[0]!
    const status = getFeedRowStatus({
      ...base,
      passage_votes: [
        {
          ...vote,
          party_splits: [
            { party: 'R', yeas: 47, nays: 2, party_line: 'yea' },
            { party: 'D', yeas: 14, nays: 30, party_line: 'nay' },
          ],
        },
      ],
    })
    expect(status.text).toBe('Passed the Senate 52–47')
    expect(status.partySplit).toBe('R 47–2 · D 14–30')
  })

  it('flags a summary written before most of the text changed', () => {
    const status = getFeedRowStatus(
      makeFeedItem({
        text_changes: {
          summary_version: 'Reported in House',
          summary_version_date: '2026-04-09',
          latest_version: 'Engrossed Amendment Senate',
          latest_version_date: '2026-11-19',
          added_provisions: [{ label: '1101.', heading: 'Purposes' }],
          more_added_count: 78,
        },
      }),
    )
    expect(status.note).toBe('Text changed after summary')
  })
})

describe('readableMemberName', () => {
  it('puts the given name first and splits off the Congress.gov bracket', () => {
    expect(readableMemberName('Rep. Smucker, Lloyd [R-PA-11]')).toEqual({
      name: 'Rep. Lloyd Smucker',
      bracket: 'R-PA-11',
    })
  })

  it('passes other shapes through', () => {
    expect(readableMemberName('Sen. Bernard Sanders (local)')).toEqual({
      name: 'Sen. Bernard Sanders (local)',
      bracket: null,
    })
  })
})
