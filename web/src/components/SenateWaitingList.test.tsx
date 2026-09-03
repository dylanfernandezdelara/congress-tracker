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

  it('drops Senate-origin bills that sit in a House committee', () => {
    render(
      <SenateWaitingList
        items={[
          makeSenateWaitingBill({
            bill_type: 'S',
            bill_number: 47,
            headline: 'Senate bill sitting in a House committee',
          }),
          makeSenateWaitingBill({
            bill_type: 'HRES',
            bill_number: 12,
            headline: 'House resolution waiting in the Senate',
          }),
        ]}
      />,
    )

    expect(screen.getByText('House resolution waiting in the Senate')).toBeInTheDocument()
    expect(screen.queryByText('Senate bill sitting in a House committee')).not.toBeInTheDocument()
  })

  it('shows a retry action instead of an empty list when the payload failed', () => {
    const onRetry = vi.fn()
    render(
      <SenateWaitingList items={[]} error="Couldn't load tightness." onRetry={onRetry} />,
    )

    expect(screen.getByText("Couldn't load tightness.")).toBeInTheDocument()
    expect(
      screen.queryByText('No House-passed bills are waiting in a Senate committee.'),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
