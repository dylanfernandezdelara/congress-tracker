import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeTightnessDot } from '../test/tightnessFixtures'
import { TightnessStrip } from './TightnessStrip'

describe('TightnessStrip', () => {
  it('always renders House and Senate rows as tap targets', () => {
    const onSelect = vi.fn()
    const house = [makeTightnessDot()]
    const senate = [
      makeTightnessDot({
        kind: 'nominee',
        chamber: 'Senate',
        roll_number: 9101,
        bill_type: null,
        bill_number: null,
        nominee_name: 'Jane Doe',
      }),
    ]
    const { container } = render(
      <TightnessStrip
        house={house}
        senate={senate}
        selectedKey={null}
        onSelect={onSelect}
        compact
      />,
    )

    expect(screen.getByRole('region', { name: 'Vote tightness' })).toBeInTheDocument()
    expect(container.querySelector('[data-tightness-row="house"]')).not.toBeNull()
    expect(container.querySelector('[data-tightness-row="senate"]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Senate bills & nominees' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /House bill H\.R\. 88/ }))
    expect(onSelect).toHaveBeenCalledWith(house[0])
  })
})
