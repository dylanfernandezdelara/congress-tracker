import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppLayout } from '../layouts/AppLayout'
import Home from './Home'

vi.mock('../api/client', () => ({
  fetchFeed: vi.fn().mockResolvedValue({
    items: [
      {
        bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
        policy_area: 'Defense',
        digest: {
          headline: 'Plain headline for readers',
          what_it_does: 'It does something important in plain language.',
          key_points: ['Point one'],
          terms_explained: [],
        },
        raw_summary_text: 'Official CRS summary text.',
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
        latest_passage_date: '2026-06-05',
      },
    ],
    total: 1,
    limit: 50,
    offset: 0,
    has_more: false,
  }),
}))

function renderFeed() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Home />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Home', () => {
  it('renders the feed as a list with visible outcomes and no flip hints', async () => {
    const { container } = renderFeed()
    expect(screen.getByRole('heading', { name: 'Congress Tracker' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Site sections' })).toBeInTheDocument()
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(screen.queryByLabelText('Members in Congress')).not.toBeInTheDocument()

    const feedList = container.querySelector('.feed-list')
    expect(feedList).not.toBeNull()
    expect(feedList?.tagName).toBe('UL')
    expect(within(feedList as HTMLElement).getByText('Passed')).toBeInTheDocument()
    expect(screen.queryByText('Flip for vote details ↺')).not.toBeInTheDocument()
    expect(container.querySelector('.feed-row')).not.toBeNull()
  })
})
