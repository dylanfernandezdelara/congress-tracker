import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeSenateWaitingBill } from '../test/tightnessFixtures'
import { SenateWaitingList } from './SenateWaitingList'

describe('SenateWaitingList', () => {
  it('lists House-passed Senate-waiting bills and opens one on tap', () => {
    const onOpenBill = vi.fn()
    render(
      <SenateWaitingList
        items={[makeSenateWaitingBill()]}
        onOpenBill={onOpenBill}
        compact
      />,
    )

    expect(
      screen.getByRole('region', { name: 'House-passed, sitting in the Senate' }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: /House-passed contracting bill waiting in the Senate/ }),
    )
    expect(onOpenBill).toHaveBeenCalledWith('119-hr-33')
  })
})
