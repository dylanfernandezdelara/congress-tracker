import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BriefingFeedItem, BriefingFeedResponse } from '../api'
import Home from './Home'

const RealDate = Date
const { fetchLatestBriefing } = vi.hoisted(() => ({
  fetchLatestBriefing: vi.fn<() => Promise<BriefingFeedResponse>>(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    fetchLatestBriefing,
  }
})

function makeItem(overrides: Partial<BriefingFeedItem> = {}): BriefingFeedItem {
  return {
    id: 'vote-201',
    congress: 119,
    session: 2,
    vote_number: 201,
    vote_date: '2026-03-08',
    title: 'Emergency funding resolution',
    summary: 'Provides emergency supplemental funding for a federal response program.',
    outcome_label: 'The measure passed with bipartisan support.',
    status: 'passed',
    category: 'Appropriations',
    significance: 'high',
    tally: {
      yea: 61,
      nay: 39,
      present: 0,
      absent: 0,
    },
    crossed_party_lines: [],
    ranking_reasons: [
      { code: 'impact', label: 'Broad national impact' },
      { code: 'coalition', label: 'Cross-party movement' },
    ],
    source_coverage: {
      level: 'full',
      vote_data: true,
      bill_context: true,
      congressional_record: true,
      floor_logs: true,
      model_summary: true,
    },
    detail_path: '/votes/201',
    score: 98,
    ...overrides,
  }
}

function makeBriefing(items: BriefingFeedItem[]): BriefingFeedResponse {
  return {
    generated_at: '2026-03-10T14:30:00Z',
    source: 'derived',
    items,
  }
}

function freezeDate(isoNow: string): void {
  const fixedNow = new RealDate(isoNow)

  class MockDate extends RealDate {
    constructor(value?: ConstructorParameters<typeof Date>[0]) {
      super(value ?? fixedNow.toISOString())
    }

    static now(): number {
      return fixedNow.getTime()
    }
  }

  vi.stubGlobal('Date', MockDate)
}

describe('Home', () => {
  beforeEach(() => {
    freezeDate('2026-03-10T12:00:00-04:00')
    window.history.pushState({}, '', '/')
    fetchLatestBriefing.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows older materialized votes instead of hiding them behind a freshness gate', async () => {
    fetchLatestBriefing.mockResolvedValue(
      makeBriefing([
        makeItem({
          id: 'vote-101',
          vote_number: 101,
          vote_date: '2026-01-05',
          title: 'War powers resolution',
          detail_path: '/votes/101',
        }),
      ]),
    )

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Washington,\s*D\.C\./)).toBeInTheDocument()
    expect(screen.getByText('War powers resolution')).toBeInTheDocument()
    expect(screen.getByText(/no ranking applied/i)).toBeInTheDocument()
  })

  it('sorts vote summaries by newest vote date and number first', async () => {
    fetchLatestBriefing.mockResolvedValue(
      makeBriefing([
        makeItem({
          id: 'vote-203',
          vote_number: 203,
          vote_date: '2026-03-08',
          title: 'Older rail safety package',
          detail_path: '/votes/203',
        }),
        makeItem({
          id: 'vote-204',
          vote_number: 204,
          vote_date: '2026-03-09',
          title: 'Newer water infrastructure package',
          detail_path: '/votes/204',
        }),
      ]),
    )

    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Washington,\s*D\.C\./)).toBeInTheDocument()
    const voteHeadings = screen.getAllByRole('heading', { level: 2 })
    expect(voteHeadings.map((heading) => heading.textContent)).toEqual([
      'Vote summaries',
      'Newer water infrastructure package',
      'Older rail safety package',
    ])
  })
})
