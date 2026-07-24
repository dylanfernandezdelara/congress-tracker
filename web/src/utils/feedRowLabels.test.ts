import { describe, expect, it } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import {
  FEED_SUMMARY_PENDING,
  getFeedRowDisplayDate,
  getFeedRowView,
  getFeedSummaryDisplay,
  getFeedTopic,
  getPrimaryPassageVote,
  isProceduralFeedItem,
} from './feedRowLabels'

describe('getFeedRowDisplayDate', () => {
  it('uses latest_passage_date for executive-linked bills with old passage votes', () => {
    const item = makeFeedItem({
      latest_passage_date: '2026-06-24',
      executive_signals: [
        {
          post_id: 'post-1',
          posted_at: '2026-06-24T14:26:00.000Z',
          summary: 'Executive post',
          quote: 'Quote text',
          source_url: 'https://example.com/post',
          informal: false,
        },
      ],
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 220,
          nays: 210,
          date: '2026-04-10',
        },
      ],
    })

    expect(getFeedRowDisplayDate(item)).toEqual({ iso: '2026-06-24', kind: 'signal' })
  })
})

describe('getFeedRowView', () => {
  it('returns meta and de-duplicated event copy for a substantive pass', () => {
    const item = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 2913, title: 'Authorize support for Ukraine' },
      digest: null,
      raw_summary_text: null,
      passage_votes: [
        {
          chamber: 'Senate',
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 52,
          nays: 47,
          date: '2026-06-05',
        },
      ],
    })

    expect(getFeedRowView(item)).toEqual({
      meta: {
        kind: 'passed',
        outcomeLabel: 'Passed',
        chamber: 'Senate',
        margin: '52–47',
        billId: 'H.R. 2913',
        presidentDeskChip: null,
      },
      eventDisplay: '52–47 in the Senate',
      badgeToneClass: ' text-pass',
      showMarginChip: true,
      showEventLine: false,
      eventToneClass: '',
    })
  })

  it('returns meta and de-duplicated event copy for a substantive fail', () => {
    const item = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 8428, title: 'Rural hospital funding' },
      digest: null,
      raw_summary_text: null,
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Passage of the Bill',
          result: 'Failed',
          yeas: 198,
          nays: 230,
          date: '2026-06-04',
        },
      ],
    })

    expect(getFeedRowView(item)).toEqual({
      meta: {
        kind: 'failed',
        outcomeLabel: 'Failed',
        chamber: 'House',
        margin: '198–230',
        billId: 'H.R. 8428',
        presidentDeskChip: null,
      },
      eventDisplay: '198–230 in the House',
      badgeToneClass: ' text-fail',
      showMarginChip: true,
      showEventLine: false,
      eventToneClass: '',
    })
  })

  it('supersedes Passed with LAW — UNSIGNED for unsigned enactment', () => {
    const item = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 6644, title: 'Housing Act' },
      passage_votes: [
        {
          chamber: 'Senate',
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 85,
          nays: 5,
          date: '2026-06-24',
        },
      ],
      lifecycle: {
        introduced_date: '2025-12-11',
        presented_date: '2026-06-29',
        signed_date: null,
        vetoed_date: null,
        became_law_date: '2026-07-11',
        law_kind: 'law_unsigned',
        public_law: 'Public Law 119-42',
        latest_action_date: '2026-07-11',
        latest_action_text: 'Became Public Law without signature.',
        derived: { status: null, day_of_ten: null, deadline_date: null, becomes_law_on: null },
      },
    })

    expect(getFeedRowView(item)).toEqual({
      meta: {
        kind: 'law_unsigned',
        outcomeLabel: 'Law — unsigned',
        chamber: 'Senate',
        margin: '85–5',
        billId: 'H.R. 6644',
        presidentDeskChip: null,
      },
      eventDisplay: "Became law without the President's signature",
      badgeToneClass: ' text-law',
      showMarginChip: true,
      showEventLine: true,
      eventToneClass: ' feed-row-event--law',
    })
  })

  it('keeps Passed and adds a President desk chip while pending signature', () => {
    const item = makeFeedItem({
      passage_votes: [
        {
          chamber: 'Senate',
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 85,
          nays: 5,
          date: '2026-06-24',
        },
      ],
      lifecycle: {
        introduced_date: '2025-12-11',
        presented_date: '2026-06-29',
        signed_date: null,
        vetoed_date: null,
        became_law_date: null,
        law_kind: null,
        public_law: null,
        latest_action_date: '2026-06-29',
        latest_action_text: 'Presented to President.',
        derived: {
          status: 'pending_signature',
          day_of_ten: 4,
          deadline_date: '2026-07-10',
          becomes_law_on: '2026-07-11',
        },
      },
    })

    expect(getFeedRowView(item).meta).toEqual({
      kind: 'passed',
      outcomeLabel: 'Passed',
      chamber: 'Senate',
      margin: '85–5',
      billId: 'S. 2',
      presidentDeskChip: "President's desk · day 4/10",
    })
  })

  it('hides the margin chip on procedural rows (tally is in the event line)', () => {
    const item = makeFeedItem({
      bill: {
        congress: 119,
        type: 'HR',
        number: 1,
        title:
          'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.',
      },
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Agreeing to the Resolution',
          result: 'Agreed to',
          yeas: 218,
          nays: 210,
          date: '2026-06-04',
        },
      ],
    })

    const view = getFeedRowView(item)
    expect(view.meta.kind).toBe('procedural')
    expect(view.showMarginChip).toBe(false)
    expect(view.showEventLine).toBe(true)
  })

  it('formats procedural agreed event copy with framing B', () => {
    const item = makeFeedItem({
      bill: {
        congress: 119,
        type: 'HRES',
        number: 512,
        title:
          'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.',
      },
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Agreeing to the Resolution',
          result: 'Agreed to',
          yeas: 218,
          nays: 210,
          date: '2026-06-04',
        },
      ],
    })

    const view = getFeedRowView(item)
    expect(view.meta.kind).toBe('procedural')
    expect(view.meta.outcomeLabel).toBe('Procedural')
    expect(view.eventDisplay).toBe('House agreed 218–210')
  })

  it('formats procedural rejected event copy with framing B', () => {
    const item = makeFeedItem({
      bill: {
        congress: 119,
        type: 'HR',
        number: 456,
        title:
          'Waiving a requirement of clause 6(a) of rule XIII with respect to consideration of certain resolutions reported from the Committee on Rules.',
      },
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Agreeing to the Resolution',
          result: 'Rejected',
          yeas: 198,
          nays: 230,
          date: '2026-06-04',
        },
      ],
    })

    const view = getFeedRowView(item)
    expect(view.meta.kind).toBe('procedural')
    expect(view.eventDisplay).toBe('House rejected 198–230 · rule for H.R. 456')
  })

  it('classifies cloture votes as procedural via question pattern', () => {
    const item = makeFeedItem({
      bill: {
        congress: 119,
        type: 'S',
        number: 2282,
        title: 'A regular bill about infrastructure funding',
      },
      digest: null,
      raw_summary_text: null,
      passage_votes: [
        {
          chamber: 'Senate',
          question: 'On the Cloture Motion',
          result: 'Passed',
          yeas: 60,
          nays: 40,
          date: '2026-06-05',
        },
      ],
    })

    expect(isProceduralFeedItem(item)).toBe(true)
    const view = getFeedRowView(item)
    expect(view.meta.kind).toBe('procedural')
    expect(view.eventDisplay).toBe('Senate agreed 60–40 · procedural vote on S. 2282')
  })
})

describe('isProceduralFeedItem', () => {
  it('classifies procedural items with a digest as procedural', () => {
    const item = makeFeedItem({
      bill: {
        congress: 119,
        type: 'HRES',
        number: 512,
        title:
          'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.',
      },
      digest: {
        headline: 'Ukraine security assistance',
        what_it_does: 'Sets floor debate terms for the underlying bill.',
        key_points: [],
        terms_explained: [],
      },
    })

    expect(isProceduralFeedItem(item)).toBe(true)
    expect(getFeedTopic(item)).toBe('Ukraine security assistance')
  })

  it('softens official title fallbacks when digest headline is missing', () => {
    const item = makeFeedItem({
      digest: null,
      bill: {
        congress: 119,
        type: 'HR',
        number: 9001,
        title:
          'To authorize appropriations for fiscal year 2026 for military activities of the Department of Defense, and for other purposes.',
      },
    })

    expect(getFeedTopic(item)).toBe(
      'Authorize appropriations for fiscal year 2026 for military activities of the Department of Defense',
    )
  })
})

describe('getPrimaryPassageVote', () => {
  it('returns the vote with the latest date when multiple votes exist', () => {
    const older = {
      chamber: 'House' as const,
      question: 'On Passage of the Bill',
      result: 'Passed',
      yeas: 220,
      nays: 210,
      date: '2026-01-15',
    }
    const newer = {
      chamber: 'Senate' as const,
      question: 'On Passage of the Bill',
      result: 'Passed',
      yeas: 52,
      nays: 47,
      date: '2026-06-05',
    }

    expect(
      getPrimaryPassageVote(makeFeedItem({ digest: null, passage_votes: [older, newer] })),
    ).toBe(newer)
    expect(
      getPrimaryPassageVote(makeFeedItem({ digest: null, passage_votes: [newer, older] })),
    ).toBe(newer)
  })
})

describe('getFeedSummaryDisplay', () => {
  it('prefers digest what_it_does over CRS text', () => {
    const item = makeFeedItem({
      digest: {
        headline: 'Sample headline',
        what_it_does: 'Plain-language implications from the digest.',
        key_points: ['Fallback point'],
        terms_explained: [],
      },
      raw_summary_text: 'Official CRS summary text.',
    })

    expect(getFeedSummaryDisplay(item)).toEqual({
      lead: 'Plain-language implications from the digest.',
      bullets: ['Fallback point'],
      pending: false,
    })
  })

  it('falls back to pending summary copy when digest is missing even if CRS text exists', () => {
    const item = makeFeedItem({
      digest: null,
      raw_summary_text:
        'No Aid for Ghost Students Act\n\nThis bill blocks federal aid for students enrolled at institutions with no physical campus.',
    })

    expect(getFeedSummaryDisplay(item)).toEqual({
      lead: FEED_SUMMARY_PENDING,
      bullets: [],
      pending: true,
    })
  })

  it('falls back to the first key point when digest lacks what_it_does', () => {
    const item = makeFeedItem({
      digest: {
        headline: 'Sample headline',
        what_it_does: '',
        key_points: ['Requires agencies to publish contract performance data'],
        terms_explained: [],
      },
      raw_summary_text: null,
    })

    expect(getFeedSummaryDisplay(item)).toEqual({
      lead: 'Requires agencies to publish contract performance data',
      bullets: [],
      pending: false,
    })
  })

  it('returns a pending placeholder when no summary sources exist', () => {
    expect(getFeedSummaryDisplay(makeFeedItem({ digest: null, raw_summary_text: null }))).toEqual({
      lead: FEED_SUMMARY_PENDING,
      bullets: [],
      pending: true,
    })
  })

  it('caps lead and bullets to collapsed feed word limits', () => {
    const item = makeFeedItem({
      digest: {
        headline: 'Sample headline',
        what_it_does:
          'This bill provides support to Ukraine and allied countries through security assistance.',
        key_points: [
          'Financing and oversight requirements for federal agencies that administer foreign military aid programs across multiple regions.',
        ],
        terms_explained: [],
      },
    })

    const summary = getFeedSummaryDisplay(item)
    expect(summary.pending).toBe(false)
    expect(summary.lead).toBe(
      'This bill provides support to Ukraine and allied countries through security assistance.',
    )
    expect(summary.bullets).toEqual([
      'Financing and oversight requirements for federal agencies that administer foreign military aid…',
    ])
  })

  it('returns a lead sentence and bullet points from the digest', () => {
    const item = makeFeedItem({
      digest: {
        headline: 'Headline',
        what_it_does: 'Blocks federal aid for ghost students.',
        key_points: ['Targets online-only schools', 'Requires enrollment verification'],
        terms_explained: [],
      },
    })

    expect(getFeedSummaryDisplay(item)).toEqual({
      lead: 'Blocks federal aid for ghost students.',
      bullets: ['Targets online-only schools', 'Requires enrollment verification'],
      pending: false,
    })
  })

  it('keeps only the first sentence for long digest text', () => {
    const item = makeFeedItem({
      digest: {
        headline: 'Headline',
        what_it_does:
          'This bill blocks aid for ghost students. It also creates new reporting rules and audit requirements for schools.',
        key_points: ['Requires annual audits'],
        terms_explained: [],
      },
    })

    expect(getFeedSummaryDisplay(item).lead).toBe('This bill blocks aid for ghost students.')
  })
})

describe('getFeedRowMeta via getFeedRowView', () => {
  it('extracts structured meta for a substantive pass', () => {
    const item = makeFeedItem({
      bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
    })

    expect(getFeedRowView(item).meta).toEqual({
      kind: 'passed',
      outcomeLabel: 'Passed',
      chamber: 'Senate',
      margin: '52–47',
      billId: 'S. 2',
      presidentDeskChip: null,
    })
  })

  it('extracts structured meta for procedural rows', () => {
    const item = makeFeedItem({
      bill: {
        congress: 119,
        type: 'HRES',
        number: 512,
        title:
          'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.',
      },
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Agreeing to the Resolution',
          result: 'Agreed to',
          yeas: 218,
          nays: 210,
          date: '2026-06-04',
        },
      ],
    })

    expect(getFeedRowView(item).meta).toEqual({
      kind: 'procedural',
      outcomeLabel: 'Procedural',
      chamber: 'House',
      margin: '218–210',
      billId: 'H.Res. 512',
      presidentDeskChip: null,
    })
  })
})

describe('getFeedEventDisplay via getFeedRowView', () => {
  it('shows de-duplicated vote copy for substantive rows', () => {
    const item = makeFeedItem()
    expect(getFeedRowView(item).eventDisplay).toBe('52–47 in the Senate')
  })

  it('omits debate-rule suffix when the procedural headline already names the bill', () => {
    const item = makeFeedItem({
      bill: {
        congress: 119,
        type: 'HRES',
        number: 512,
        title:
          'Providing for consideration of the bill (H.R. 2913) to authorize support for Ukraine, and for other purposes.',
      },
      passage_votes: [
        {
          chamber: 'House',
          question: 'On Agreeing to the Resolution',
          result: 'Agreed to',
          yeas: 218,
          nays: 210,
          date: '2026-06-04',
        },
      ],
    })

    expect(getFeedRowView(item).eventDisplay).toBe('House agreed 218–210')
  })
})
