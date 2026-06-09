import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Home from './Home'

vi.mock('../api/client', () => ({
  fetchFeed: vi.fn().mockResolvedValue([
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
  ]),
}))

describe('Home', () => {
  it('renders the feed with a digestible headline', async () => {
    render(<Home />)
    expect(screen.getByRole('heading', { name: 'Congress Tracker' })).toBeInTheDocument()
    expect(await screen.findByText('Plain headline for readers')).toBeInTheDocument()
    expect(screen.getByText(/Senate/)).toBeInTheDocument()
  })
})
