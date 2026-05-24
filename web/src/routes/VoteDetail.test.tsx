import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoteDetailResponse } from '../api'
import VoteDetail from './VoteDetail'

const { fetchVoteDetail } = vi.hoisted(() => ({
  fetchVoteDetail: vi.fn<() => Promise<VoteDetailResponse>>(),
}))

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    fetchVoteDetail,
  }
})

const fixtureDetail = {
  generated_at: '2026-03-10T14:30:00Z',
  source: 'derived',
  vote: {
    id: '119:2:14',
    congress: 119,
    session: 2,
    vote_number: 14,
    vote_date: '2026-03-09',
    title: 'Rail safety package',
    question: 'On Passage of the Bill',
    result: 'Agreed to',
    status: 'passed',
    tally: { yea: 60, nay: 40, present: 0, absent: 0 },
  },
  procedural_context: { step_type: 'passage', question: 'On Passage of the Bill' },
  party_breakdown: [],
  crossovers: [],
  arguments: { available: false, coverage_note: 'No excerpts', parties: [], excerpts: [] },
  history: {
    thread_key: '119:S:100',
    measure_recurrence_count: 1,
    issue_key: '119:S:100',
    issue_title: 'Rail safety package',
    issue_recurrence_count: 1,
    related_votes: [],
  },
  source_coverage: {
    level: 'partial',
    vote_data: true,
    bill_context: true,
    congressional_record: false,
    floor_logs: false,
    model_summary: false,
  },
  vote_content_profile: {
    public_impact_summary: 'Improves rail safety standards.',
    source_basis: ['vote_question'],
    content_confidence: 'high',
    plain_action: 'Passed the bill',
  },
} as unknown as VoteDetailResponse

const fixtureDetailTyped: VoteDetailResponse = fixtureDetail

function renderVoteDetail(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/votes/:congress/:session/:voteNumber" element={<VoteDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('VoteDetail', () => {
  beforeEach(() => {
    fetchVoteDetail.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads fixture vote detail without calling fetchVoteDetail when ?e2e=1', async () => {
    renderVoteDetail('/votes/119/2/14?e2e=1')

    expect(
      await screen.findByRole('heading', { name: 'Border Infrastructure Modernization Act' }),
    ).toBeInTheDocument()
    expect(fetchVoteDetail).not.toHaveBeenCalled()
  })

  it('shows an error when fixture vote detail is missing in e2e mode', async () => {
    renderVoteDetail('/votes/119/2/99?e2e=1')

    expect(await screen.findByText(/No fixture detail exists/i)).toBeInTheDocument()
    expect(fetchVoteDetail).not.toHaveBeenCalled()
  })

  it('preserves ?e2e=1 on the back link', async () => {
    renderVoteDetail('/votes/119/2/14?e2e=1')

    const backLink = await screen.findByRole('link', { name: /Back to briefing/i })
    expect(backLink.getAttribute('href')).toContain('e2e=1')
  })

  it('calls the API client in live mode', async () => {
    fetchVoteDetail.mockResolvedValue({
      ...fixtureDetailTyped,
      vote: { ...fixtureDetailTyped.vote, title: 'Live API Vote Title' },
    })
    renderVoteDetail('/votes/119/2/14')

    expect(await screen.findByRole('heading', { name: 'Live API Vote Title' })).toBeInTheDocument()
    expect(fetchVoteDetail).toHaveBeenCalledWith('119', '2', '14')
  })
})
