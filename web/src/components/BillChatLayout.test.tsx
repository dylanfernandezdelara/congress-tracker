import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import billChatCss from '../styles/bill-chat.css?raw'
import { resetBillChatInstancesForTests } from '../utils/billChatInstance'
import { BILL_CHAT_DRAWER_PEEK } from './BillChatDrawer'
import {
  BillChatLayoutProvider,
  useBillChatSession,
  usePresentBillChat,
  type BillChatSource,
} from './BillChatLayout'
import { BillChatSection } from './BillChatSection'

vi.mock('@ai-sdk/react', () => ({
  Chat: class Chat {},
  useChat: () => ({
    messages: [],
    status: 'ready',
    error: undefined,
    sendMessage: vi.fn(),
    regenerate: vi.fn(),
    stop: vi.fn(),
  }),
}))

afterEach(() => {
  resetBillChatInstancesForTests()
})

describe('bill-chat.css', () => {
  it('keeps the JS peek string lockstep with --bill-chat-peek', () => {
    expect(billChatCss).toContain(`--bill-chat-peek: ${BILL_CHAT_DRAWER_PEEK}`)
  })

  it('bounds the chat only inside the rail and drawer so the log is the one scrollport', () => {
    expect(billChatCss).toContain('.bill-chat-rail .bill-chat-body')
    expect(billChatCss).toContain('.bill-chat-drawer-inner .bill-chat-body')
    expect(billChatCss).toMatch(/\.bill-chat-body[^{]*\{[^}]*min-height: 0/)
    // Only the log flexes; suggestions, alerts, and the PromptInput keep their height.
    expect(billChatCss).toContain('.bill-chat-body > :not(.bill-chat-conversation)')
    expect(billChatCss).toMatch(/\.bill-chat-conversation\s*\{[^}]*flex: 1 1 auto/)
  })

  it('sizes the drawer column to the visible vaul slice, not the untranslated sheet', () => {
    expect(billChatCss).toContain('.bill-chat-drawer-snap')
    expect(billChatCss).toContain('height: calc(100% - var(--snap-point-height, 0px))')
  })

  it('leaves the chat surface to stock AI Elements and only lays out the dock', () => {
    for (const restyled of [
      'bill-chat-bubble',
      'bill-chat-prose',
      'bill-chat-quote',
      'bill-chat-suggestion',
      'bill-chat-prompt-group',
      'bill-chat-export-trigger',
      'bill-chat-streaming',
    ]) {
      expect(billChatCss).not.toContain(restyled)
    }
  })
})

function SessionLabel() {
  const session = useBillChatSession()
  return (
    <div data-testid="session">
      {session
        ? `${session.billId}#${session.asks}:${session.chat.pendingSelection ?? ''}`
        : 'none'}
    </div>
  )
}

const noop = () => {}

function Present({
  type,
  number,
  title,
  onSharePassage = noop,
  askLabel,
}: {
  type: 'S' | 'HR'
  number: number
  title?: string
  onSharePassage?: BillChatSource['onSharePassage']
  /** Renders a button that asks about this text. */
  askLabel?: string
}) {
  const ask = usePresentBillChat({
    item: makeFeedItem({
      bill: { congress: 119, type, number, title: title ?? `${type} ${number}` },
    }),
    onSharePassage,
    onQuoteCreated: noop,
  })
  return askLabel ? (
    <button type="button" onClick={() => ask(`about ${type}.${number}`)}>
      {askLabel}
    </button>
  ) : null
}

describe('usePresentBillChat', () => {
  it('shows the newest source and reclaims it when that presenter unmounts', () => {
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
    expect(screen.getByTestId('session')).toHaveTextContent('119-hr-1#0:')

    rerender(<App showSecond={false} />)
    expect(screen.getByTestId('session')).toHaveTextContent('119-s-2#0:')

    rerender(<App showSecond />)
    expect(screen.getByTestId('session')).toHaveTextContent('119-hr-1#0:')
  })

  it('brings a background source forward when it asks, and counts the asks', () => {
    render(
      <BillChatLayoutProvider>
        <Present type="S" number={2} askLabel="ask first" />
        <Present type="HR" number={1} askLabel="ask second" />
        <SessionLabel />
      </BillChatLayoutProvider>,
    )
    expect(screen.getByTestId('session')).toHaveTextContent('119-hr-1#0:')

    fireEvent.click(screen.getByRole('button', { name: 'ask first' }))
    expect(screen.getByTestId('session')).toHaveTextContent('119-s-2#1:about S.2')

    fireEvent.click(screen.getByRole('button', { name: 'ask first' }))
    expect(screen.getByTestId('session')).toHaveTextContent('119-s-2#2:about S.2')

    fireEvent.click(screen.getByRole('button', { name: 'ask second' }))
    expect(screen.getByTestId('session')).toHaveTextContent('119-hr-1#1:about HR.1')
  })

  it('clears only the pending selection, keeping the source and its ask count', () => {
    function Clear() {
      const session = useBillChatSession()
      return (
        <button type="button" onClick={() => session?.chat.onClearSelection?.()}>
          clear
        </button>
      )
    }
    render(
      <BillChatLayoutProvider>
        <Present type="S" number={2} askLabel="ask" />
        <SessionLabel />
        <Clear />
      </BillChatLayoutProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ask' }))
    expect(screen.getByTestId('session')).toHaveTextContent('119-s-2#1:about S.2')

    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByTestId('session')).toHaveTextContent('119-s-2#1:')
  })

  it('does not restack when an inactive source only re-renders with a patched item', () => {
    function App({ firstTitle }: { firstTitle: string }) {
      return (
        <BillChatLayoutProvider>
          <Present type="S" number={2} title={firstTitle} />
          <Present type="HR" number={1} />
          <SessionLabel />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App firstTitle="Original" />)
    expect(screen.getByTestId('session')).toHaveTextContent('119-hr-1#0:')
    rerender(<App firstTitle="Updated title" />)
    expect(screen.getByTestId('session')).toHaveTextContent('119-hr-1#0:')
  })

  it('keeps share handlers current without restacking the occupant', () => {
    const firstShare = vi.fn()
    const nextShare = vi.fn()

    function ShareButton() {
      const session = useBillChatSession()
      return (
        <button type="button" onClick={() => session?.chat.onSharePassage('hi')}>
          share
        </button>
      )
    }

    function App({ share }: { share: (text: string) => void }) {
      return (
        <BillChatLayoutProvider>
          <Present type="S" number={2} onSharePassage={share} />
          <SessionLabel />
          <ShareButton />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App share={firstShare} />)
    expect(screen.getByTestId('session')).toHaveTextContent('119-s-2#0:')
    fireEvent.click(screen.getByRole('button', { name: 'share' }))
    expect(firstShare).toHaveBeenCalledWith('hi')

    rerender(<App share={nextShare} />)
    expect(screen.getByTestId('session')).toHaveTextContent('119-s-2#0:')
    fireEvent.click(screen.getByRole('button', { name: 'share' }))
    expect(nextShare).toHaveBeenCalledWith('hi')
    expect(firstShare).toHaveBeenCalledTimes(1)
  })

  it('is a no-op without a provider so isolated detail tests still render', () => {
    render(<Present type="S" number={2} askLabel="ask" />)
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'ask' }))).not.toThrow()
  })

  it('remounts the chat for a new occupant so the previous draft does not carry over', () => {
    function Host() {
      const session = useBillChatSession()
      return session ? <BillChatSection key={session.billId} {...session.chat} /> : null
    }
    function App({ number }: { number: number }) {
      return (
        <BillChatLayoutProvider>
          <Host />
          <Present type="S" number={number} />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App number={2} />)
    const box = screen.getByRole('textbox', { name: 'Ask about this bill' })
    fireEvent.change(box, { target: { value: 'draft for S.2' } })
    expect(box).toHaveValue('draft for S.2')

    rerender(<App number={3} />)
    expect(screen.getByRole('textbox', { name: 'Ask about this bill' })).toHaveValue('')
  })
})
