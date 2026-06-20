import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppLayout } from '../layouts/AppLayout'
import PlayPage from './PlayPage'

vi.mock('../api/client', () => ({
  fetchGameRounds: vi.fn().mockResolvedValue({
    rounds: [
      {
        id: 'Senate:119:2:7',
        prompt: {
          headline: 'Aid package for allies',
          snippet: 'Sends emergency funding to partner nations.',
        },
      },
    ],
    total: 1,
    limit: 20,
  }),
  fetchGameReveal: vi.fn().mockResolvedValue({
    id: 'Senate:119:2:7',
    correct: 'passed',
    vote: {
      chamber: 'Senate',
      question: 'On Passage of the Bill',
      result: 'Passed',
      yeas: 52,
      nays: 47,
      date: '2026-06-05',
    },
    bill: {
      congress: 119,
      type: 'S',
      number: 2,
      title: 'Sample Act',
    },
    policy_area: 'Defense',
    digest: {
      headline: 'Aid package for allies',
      what_it_does: 'Sends emergency funding to partner nations.',
      key_points: [],
      terms_explained: [],
    },
    party_split: [
      { party: 'D', yeas: 48, nays: 2 },
      { party: 'R', yeas: 4, nays: 45 },
    ],
  }),
}))

function renderPlayPage() {
  return render(
    <MemoryRouter initialEntries={['/play']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/play" element={<PlayPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('PlayPage', () => {
  it('renders a blind prompt without vote metadata', async () => {
    renderPlayPage()

    expect(await screen.findByText('Aid package for allies')).toBeInTheDocument()
    expect(screen.getByText('Sends emergency funding to partner nations.')).toBeInTheDocument()
    expect(screen.queryByText('Final tally: 52–47 in the Senate')).not.toBeInTheDocument()
    expect(screen.queryByText('Party breakdown')).not.toBeInTheDocument()
  })

  it('reveals the vote only after a guess', async () => {
    renderPlayPage()

    await screen.findByText('Aid package for allies')
    const card = screen.getByRole('article')
    fireEvent.click(within(card).getByRole('button', { name: 'Passed' }))

    expect(await screen.findByText(/Correct/)).toBeInTheDocument()
    expect(screen.getByText('You guessed passed. It passed.')).toBeInTheDocument()
    expect(screen.getByText('52–47')).toBeInTheDocument()
    expect(screen.getByText(/Jun 5/)).toBeInTheDocument()
    expect(screen.getByText('Party breakdown')).toBeInTheDocument()
  })
})
