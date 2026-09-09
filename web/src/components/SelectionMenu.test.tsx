import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TextSelection } from '../hooks/useTextSelectionMenu'
import { SelectionMenu } from './SelectionMenu'

function makeSelection(): TextSelection {
  return {
    text: 'raises the cap',
    source: 'digest',
    rect: new DOMRect(200, 300, 120, 18),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SelectionMenu', () => {
  it('renders nothing without a selection', () => {
    render(<SelectionMenu selection={null} onShareQuote={vi.fn()} onCopy={vi.fn()} />)
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('offers Share quote and Copy for a selection and forwards it', () => {
    const onShareQuote = vi.fn()
    const onCopy = vi.fn()
    const selection = makeSelection()
    render(<SelectionMenu selection={selection} onShareQuote={onShareQuote} onCopy={onCopy} />)

    const toolbar = screen.getByRole('toolbar', { name: 'Selected text actions' })
    expect(toolbar).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask about this' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Share quote' }))
    expect(onShareQuote).toHaveBeenCalledWith(selection)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopy).toHaveBeenCalledWith(selection)
  })

  it('shows Ask about this only when a handler is supplied', () => {
    const onAsk = vi.fn()
    const selection = makeSelection()
    render(
      <SelectionMenu selection={selection} onShareQuote={vi.fn()} onAsk={onAsk} onCopy={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ask about this' }))
    expect(onAsk).toHaveBeenCalledWith(selection)
  })

  it('replaces the buttons with a status message and disables while busy', () => {
    const { rerender } = render(
      <SelectionMenu selection={makeSelection()} busy onShareQuote={vi.fn()} onCopy={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Sharing…' })).toBeDisabled()

    rerender(
      <SelectionMenu
        selection={makeSelection()}
        status="Select at least 12 characters to share a quote."
        onShareQuote={vi.fn()}
        onCopy={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Select at least 12 characters')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps the DOM selection alive by swallowing mousedown', () => {
    render(<SelectionMenu selection={makeSelection()} onShareQuote={vi.fn()} onCopy={vi.fn()} />)
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    screen.getByRole('toolbar').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
