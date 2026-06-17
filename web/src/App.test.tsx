import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('./api/client', () => ({
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
        passage_votes: [],
        latest_passage_date: '2026-06-05',
      },
    ],
    total: 1,
    limit: 50,
    offset: 0,
    has_more: false,
  }),
}))

describe('App routing', () => {
  it('redirects unknown paths to the feed', async () => {
    window.history.pushState({}, '', '/unknown-path')
    render(<App />)

    expect(screen.getByRole('heading', { name: 'What is Congress Doing?' })).toBeInTheDocument()
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Site sections' })).toBeInTheDocument()
  })
})
