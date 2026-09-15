import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import {
  BILL_CHAT_DRAWER_FULL,
  BILL_CHAT_DRAWER_HALF,
  BILL_CHAT_DRAWER_PEEK,
  BillChatLayoutProvider,
  billChatDrawerSnap,
  useBillChatSession,
  usePresentBillChat,
} from './BillChatLayout'

describe('billChatDrawerSnap', () => {
  it('maps vaul snap points to peek, half, and full', () => {
    expect(typeof BILL_CHAT_DRAWER_PEEK).toBe('string')
    expect(BILL_CHAT_DRAWER_PEEK.endsWith('px')).toBe(true)
    expect(billChatDrawerSnap(BILL_CHAT_DRAWER_PEEK)).toBe('peek')
    expect(billChatDrawerSnap(BILL_CHAT_DRAWER_HALF)).toBe('half')
    expect(billChatDrawerSnap(BILL_CHAT_DRAWER_FULL)).toBe('full')
    expect(billChatDrawerSnap(null)).toBe('peek')
  })
})

function SessionBill() {
  const session = useBillChatSession()
  return <div data-testid="session-bill">{session ? `${session.item.bill.type}-${session.item.bill.number}` : 'none'}</div>
}

function Present({ type, number }: { type: 'S' | 'HR'; number: number }) {
  usePresentBillChat({
    item: makeFeedItem({ bill: { congress: 119, type, number, title: `${type} ${number}` } }),
    pendingSelection: null,
    onClearSelection: () => {},
    onSharePassage: () => {},
    onQuoteCreated: () => {},
  })
  return null
}

describe('usePresentBillChat', () => {
  it('reclaims the previous source when the latest presenter unmounts', () => {
    function App({ showSecond }: { showSecond: boolean }) {
      return (
        <BillChatLayoutProvider>
          <Present type="S" number={2} />
          {showSecond ? <Present type="HR" number={1} /> : null}
          <SessionBill />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App showSecond />)
    expect(screen.getByTestId('session-bill')).toHaveTextContent('HR-1')

    rerender(<App showSecond={false} />)
    expect(screen.getByTestId('session-bill')).toHaveTextContent('S-2')
  })
})
