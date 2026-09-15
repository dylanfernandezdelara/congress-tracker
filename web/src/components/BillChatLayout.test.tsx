import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import billChatCss from '../styles/bill-chat.css?raw'
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
    expect(billChatDrawerSnap(0.61)).toBe('peek')
  })

  it('keeps the JS peek string lockstep with --bill-chat-peek', () => {
    expect(billChatCss).toContain(`--bill-chat-peek: ${BILL_CHAT_DRAWER_PEEK}`)
  })

  it('makes the chat body a flex child so the transcript can scroll', () => {
    expect(billChatCss).toContain('.bill-chat-dock--rail .bill-chat-body')
    expect(billChatCss).toContain('.bill-chat-drawer-inner .bill-chat-body')
    expect(billChatCss).toMatch(/\.bill-chat-body[^{]*\{[^}]*min-height: 0/)
  })
})

function SessionLabel() {
  const session = useBillChatSession()
  return (
    <div data-testid="session">
      {session
        ? `${session.item.bill.type}-${session.item.bill.number}:${session.pendingSelection ?? ''}`
        : 'none'}
    </div>
  )
}

function Present({
  type,
  number,
  pendingSelection = null,
  askNonce = 0,
}: {
  type: 'S' | 'HR'
  number: number
  pendingSelection?: string | null
  askNonce?: number
}) {
  usePresentBillChat({
    item: makeFeedItem({ bill: { congress: 119, type, number, title: `${type} ${number}` } }),
    pendingSelection,
    askNonce,
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
          <SessionLabel />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App showSecond />)
    expect(screen.getByTestId('session')).toHaveTextContent('HR-1:')

    rerender(<App showSecond={false} />)
    expect(screen.getByTestId('session')).toHaveTextContent('S-2:')
  })

  it('steals the dock when a background source asks', () => {
    function App({ askFirst }: { askFirst: boolean }) {
      return (
        <BillChatLayoutProvider>
          <Present
            type="S"
            number={2}
            pendingSelection={askFirst ? 'from the first bill' : null}
            askNonce={askFirst ? 1 : 0}
          />
          <Present type="HR" number={1} />
          <SessionLabel />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App askFirst={false} />)
    expect(screen.getByTestId('session')).toHaveTextContent('HR-1:')

    rerender(<App askFirst />)
    expect(screen.getByTestId('session')).toHaveTextContent('S-2:from the first bill')
  })

  it('does not steal when an inactive source still has a leftover Ask chip', () => {
    function First({ title }: { title: string }) {
      usePresentBillChat({
        item: makeFeedItem({ bill: { congress: 119, type: 'S', number: 2, title } }),
        pendingSelection: 'leftover chip',
        askNonce: 1,
        onClearSelection: () => {},
        onSharePassage: () => {},
        onQuoteCreated: () => {},
      })
      return null
    }

    function App({ firstTitle }: { firstTitle: string }) {
      return (
        <BillChatLayoutProvider>
          <First title={firstTitle} />
          <Present type="HR" number={1} />
          <SessionLabel />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App firstTitle="Original" />)
    expect(screen.getByTestId('session')).toHaveTextContent('HR-1:')
    rerender(<App firstTitle="Updated title" />)
    expect(screen.getByTestId('session')).toHaveTextContent('HR-1:')
  })

  it('does not steal when only the inactive item identity is patched', () => {
    function First({ title }: { title: string }) {
      usePresentBillChat({
        item: makeFeedItem({ bill: { congress: 119, type: 'S', number: 2, title } }),
        pendingSelection: null,
        onClearSelection: () => {},
        onSharePassage: () => {},
        onQuoteCreated: () => {},
      })
      return null
    }

    function App({ firstTitle }: { firstTitle: string }) {
      return (
        <BillChatLayoutProvider>
          <First title={firstTitle} />
          <Present type="HR" number={1} />
          <SessionLabel />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App firstTitle="Original" />)
    expect(screen.getByTestId('session')).toHaveTextContent('HR-1:')
    rerender(<App firstTitle="Updated title" />)
    expect(screen.getByTestId('session')).toHaveTextContent('HR-1:')
  })

  it('keeps share handlers current without restacking the occupant', () => {
    const firstShare = vi.fn()
    const nextShare = vi.fn()

    function Host({ share }: { share: (text: string) => void }) {
      usePresentBillChat({
        item: makeFeedItem(),
        pendingSelection: null,
        onClearSelection: () => {},
        onSharePassage: share,
        onQuoteCreated: () => {},
      })
      return null
    }

    function ShareButton() {
      const session = useBillChatSession()
      return (
        <button type="button" onClick={() => session?.onSharePassage('hi')}>
          share
        </button>
      )
    }

    function App({ share }: { share: (text: string) => void }) {
      return (
        <BillChatLayoutProvider>
          <Host share={share} />
          <SessionLabel />
          <ShareButton />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App share={firstShare} />)
    expect(screen.getByTestId('session')).toHaveTextContent('S-2:')
    fireEvent.click(screen.getByRole('button', { name: 'share' }))
    expect(firstShare).toHaveBeenCalledWith('hi')

    rerender(<App share={nextShare} />)
    expect(screen.getByTestId('session')).toHaveTextContent('S-2:')
    fireEvent.click(screen.getByRole('button', { name: 'share' }))
    expect(nextShare).toHaveBeenCalledWith('hi')
    expect(firstShare).toHaveBeenCalledTimes(1)
  })
})
