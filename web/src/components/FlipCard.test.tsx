import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FlipCard } from './FlipCard'

describe('FlipCard', () => {
  it('does not flip when the front scroll container moved during the gesture', () => {
    const { container } = render(
      <FlipCard front={<p className="front-body">Plain summary</p>} back={<p>Official summary</p>} />,
    )

    const inner = container.querySelector('.flip-card-inner')
    const front = container.querySelector('.flip-card-front')
    expect(inner).not.toBeNull()
    expect(front).not.toBeNull()

    Object.defineProperty(front!, 'scrollTop', { value: 0, writable: true, configurable: true })

    fireEvent.pointerDown(inner!, { clientX: 20, clientY: 40, pointerId: 1 })
    front!.scrollTop = 48
    fireEvent.click(inner!, { clientX: 20, clientY: 40 })

    expect(inner).not.toHaveClass('is-flipped')
  })

  it('flips on a tap when the front scroll position is unchanged', () => {
    const { container } = render(
      <FlipCard front={<p className="front-body">Plain summary</p>} back={<p>Official summary</p>} />,
    )

    const inner = container.querySelector('.flip-card-inner')
    const front = container.querySelector('.flip-card-front')
    expect(inner).not.toBeNull()
    expect(front).not.toBeNull()

    Object.defineProperty(front!, 'scrollTop', { value: 0, writable: true, configurable: true })

    fireEvent.pointerDown(inner!, { clientX: 20, clientY: 40, pointerId: 1 })
    fireEvent.click(inner!, { clientX: 20, clientY: 40 })

    expect(inner).toHaveClass('is-flipped')
  })
})
