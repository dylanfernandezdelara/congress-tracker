import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('../api/client', () => ({ sendSummaryFeedback: (...args: unknown[]) => send(...args) }))

import { SummaryFeedback } from './SummaryFeedback'

describe('SummaryFeedback', () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue(true)
    window.localStorage.clear()
  })
  afterEach(() => window.localStorage.clear())

  it('sends a vote once, thanks the reader, and remembers it for this bill', () => {
    const { unmount } = render(<SummaryFeedback bill="119-hr-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))

    expect(send).toHaveBeenCalledWith({ bill: '119-hr-1', kind: 'unhelpful' })
    expect(screen.getByRole('status')).toHaveTextContent('Thanks for the feedback.')
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
    unmount()

    render(<SummaryFeedback bill="119-hr-1" />)
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Report a mistake' })).toBeInTheDocument()
  })

  it('reports a mistake with a note', async () => {
    render(<SummaryFeedback bill="119-hr-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a mistake' }))
    fireEvent.change(screen.getByLabelText('What’s wrong with this summary?'), { target: { value: 'Wrong amount' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('We’ll check this summary.'))
    expect(send).toHaveBeenCalledWith({ bill: '119-hr-1', kind: 'mistake', note: 'Wrong amount' })
  })

  it('keeps the note and says so when a report cannot be sent', async () => {
    send.mockResolvedValue(false)
    render(<SummaryFeedback bill="119-hr-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a mistake' }))
    fireEvent.change(screen.getByLabelText('What’s wrong with this summary?'), { target: { value: 'Wrong date' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t send. Try again.'))
    expect(screen.getByLabelText('What’s wrong with this summary?')).toHaveValue('Wrong date')
  })
})
