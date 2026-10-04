import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('../api/client', () => ({ sendSummaryFeedback: (...args: unknown[]) => send(...args) }))

import { SummaryFeedback, SummaryFeedbackAsk, useSummaryFeedback } from './SummaryFeedback'

/** The two placements as FeedSummarySections mounts them: the ask under the summary, the report row at the end. */
function Harness({ bill }: { bill: string }) {
  const feedback = useSummaryFeedback(bill)
  if (!feedback) return null
  return (
    <>
      <section data-testid="ask">
        <SummaryFeedbackAsk feedback={feedback} />
      </section>
      <section data-testid="end">
        <SummaryFeedback feedback={feedback} />
      </section>
    </>
  )
}

const within = (id: 'ask' | 'end') => screen.getByTestId(id)

describe('SummaryFeedback', () => {
  beforeEach(() => {
    send.mockReset()
    send.mockResolvedValue(true)
    window.localStorage.clear()
  })
  afterEach(() => window.localStorage.clear())

  it('asks "Was this clear?" with real Yes / No buttons and keeps "Report a mistake" at the end', () => {
    render(<Harness bill="119-hr-1" />)
    expect(within('ask')).toHaveTextContent('Was this clear?')
    expect(within('ask').querySelectorAll('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Yes' })).toHaveClass('feed-row-feedback-choice')
    expect(within('end').querySelector('button')).toHaveTextContent('Report a mistake')
    // One vote prompt per summary.
    expect(screen.getAllByRole('button', { name: 'Yes' })).toHaveLength(1)
  })

  it('sends a vote once, says a quiet thanks with "Report a mistake" beside it, and remembers it for this bill', () => {
    const { unmount } = render(<Harness bill="119-hr-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ bill: '119-hr-1', kind: 'unhelpful' })
    const thanks = within('ask').querySelector('[role="status"]')
    expect(thanks).toHaveTextContent('Thanks.')
    expect(thanks).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
    expect(within('ask').querySelector('button')).toHaveTextContent('Report a mistake')
    unmount()

    // Next visit: the ask is gone; the report row at the end stays.
    render(<Harness bill="119-hr-1" />)
    expect(within('ask')).toBeEmptyDOMElement()
    expect(screen.getAllByRole('button', { name: 'Report a mistake' })).toHaveLength(1)
  })

  it('opens the report form under the ask after a vote and sends it from there', async () => {
    render(<Harness bill="119-hr-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    fireEvent.click(within('ask').querySelector('button') as HTMLButtonElement)

    const note = screen.getByLabelText('What’s wrong with this summary?')
    expect(within('ask')).toContainElement(note)
    expect(note).toHaveFocus()
    // Only one form, and no second "Report a mistake" while it is open.
    expect(screen.queryByRole('button', { name: 'Report a mistake' })).toBeNull()

    fireEvent.change(note, { target: { value: 'Wrong amount' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    await waitFor(() => expect(within('ask')).toHaveTextContent('We’ll check this summary.'))
    expect(send).toHaveBeenLastCalledWith({ bill: '119-hr-1', kind: 'mistake', note: 'Wrong amount' })
  })

  it('reports a mistake with a note from the row at the end', async () => {
    render(<Harness bill="119-hr-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a mistake' }))
    expect(within('end')).toContainElement(screen.getByLabelText('What’s wrong with this summary?'))
    fireEvent.change(screen.getByLabelText('What’s wrong with this summary?'), { target: { value: 'Wrong amount' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    const status = () => within('end').querySelector('[role="status"]')
    await waitFor(() => expect(status()).toHaveTextContent('We’ll check this summary.'))
    expect(send).toHaveBeenCalledWith({ bill: '119-hr-1', kind: 'mistake', note: 'Wrong amount' })
    // Focus lands on the confirmation, not the page body.
    expect(status()).toHaveFocus()
  })

  it('moves focus into the form and back to the button on Cancel, and blocks double sends', async () => {
    let resolve: (ok: boolean) => void = () => undefined
    send.mockImplementation(() => new Promise<boolean>((r) => (resolve = r)))
    render(<Harness bill="119-hr-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a mistake' }))
    expect(screen.getByLabelText('What’s wrong with this summary?')).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled()
    resolve(false)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t send.'))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Report a mistake' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument()
  })

  it('keeps one live region mounted in the ask so the thanks is announced', () => {
    render(<Harness bill="119-hr-1" />)
    const region = within('ask').querySelector('[role="status"]')
    expect(region).toHaveTextContent('')
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(within('ask').querySelector('[role="status"]')).toBe(region)
    expect(region).toHaveTextContent('Thanks.')
  })

  it('keeps the note and says so when a report cannot be sent', async () => {
    send.mockResolvedValue(false)
    render(<Harness bill="119-hr-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Report a mistake' }))
    fireEvent.change(screen.getByLabelText('What’s wrong with this summary?'), { target: { value: 'Wrong date' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t send. Try again.'))
    expect(screen.getByLabelText('What’s wrong with this summary?')).toHaveValue('Wrong date')
  })

  it('shows nothing without a bill', () => {
    const { container } = render(<HarnessNull />)
    expect(container).toBeEmptyDOMElement()
  })
})

function HarnessNull() {
  const feedback = useSummaryFeedback(null)
  return feedback ? <SummaryFeedbackAsk feedback={feedback} /> : null
}
