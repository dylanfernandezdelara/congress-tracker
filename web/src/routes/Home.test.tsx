import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import Home from './Home'

vi.mock('../api/client', () => ({
  fetchHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    timestamp: '2026-01-01T00:00:00.000Z',
    target_state: 'ALL',
    congress: '119',
    session: '2',
  }),
}))

describe('Home', () => {
  it('shows the redesign placeholder and worker health', async () => {
    render(<Home />)
    expect(screen.getByRole('heading', { name: 'Congress Tracker' })).toBeInTheDocument()
    expect(await screen.findByText('ok')).toBeInTheDocument()
  })
})
