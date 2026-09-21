import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeFeedItem } from '../test/feedItemFixtures'
import { mockViewport } from '../test/homeRouteHarness'
import { resetBillChatInstancesForTests } from '../utils/billChatInstance'
import {
  registerSheetLayer,
  resetSheetLayerForTests,
  type SheetLayerController,
} from '../utils/sheetLayer'

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

import {
  BILL_CHAT_DRAWER_FULL,
  BILL_CHAT_DRAWER_HALF,
  BILL_CHAT_DRAWER_PEEK,
  BillChatDrawer,
  billChatDrawerSnap,
} from './BillChatDrawer'
import { BillChatLayoutProvider, usePresentBillChat } from './BillChatLayout'

const noop = () => {}

function Presenter({ number = 2, askLabel }: { number?: number; askLabel?: string }) {
  const ask = usePresentBillChat({
    item: makeFeedItem({ bill: { congress: 119, type: 'S', number, title: `S ${number}` } }),
    onSharePassage: noop,
    onQuoteCreated: noop,
  })
  return askLabel ? (
    <button type="button" onClick={() => ask('same passage')}>
      {askLabel}
    </button>
  ) : null
}

function renderDrawer(children: React.ReactNode) {
  return render(
    <BillChatLayoutProvider>
      <BillChatDrawer />
      {children}
    </BillChatLayoutProvider>,
  )
}

const textbox = () => screen.queryByRole('textbox', { name: 'Ask about this bill' })

describe('billChatDrawerSnap', () => {
  it('maps vaul snap points to peek, half, and full', () => {
    expect(BILL_CHAT_DRAWER_PEEK.endsWith('px')).toBe(true)
    expect(billChatDrawerSnap(BILL_CHAT_DRAWER_PEEK)).toBe('peek')
    expect(billChatDrawerSnap(BILL_CHAT_DRAWER_HALF)).toBe('half')
    expect(billChatDrawerSnap(BILL_CHAT_DRAWER_FULL)).toBe('full')
    expect(billChatDrawerSnap(null)).toBe('peek')
    expect(billChatDrawerSnap(0.61)).toBe('peek')
  })
})

describe('BillChatDrawer', () => {
  beforeEach(() => {
    mockViewport(false)
  })

  afterEach(() => {
    resetBillChatInstancesForTests()
    resetSheetLayerForTests()
  })

  it('renders nothing until a bill presents a session', () => {
    renderDrawer(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('peeks as a title bar with Open chat when a bill is presented', async () => {
    renderDrawer(<Presenter />)

    expect(await screen.findByRole('dialog', { name: 'Ask about this bill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument()
    expect(textbox()).not.toBeInTheDocument()
    // Open in… rides with the composer, so the peek bar is title + Open chat only.
    expect(
      screen.queryByRole('button', { name: 'Open this conversation in ChatGPT or Claude' }),
    ).not.toBeInTheDocument()
    expect(document.querySelector('.bill-chat-drawer-inner')).toHaveAttribute('data-snap', 'peek')
    expect(document.querySelector('.bill-chat-drawer-inner')).toHaveAttribute('data-bill', '119-s-2')
  })

  it('opens to half and minimizes back to peek from the bar', async () => {
    renderDrawer(<Presenter />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open chat' }))
    expect(textbox()).toBeInTheDocument()
    expect(document.querySelector('.bill-chat-drawer-inner')).toHaveAttribute('data-snap', 'half')
    expect(
      screen.getByRole('button', { name: 'Open this conversation in ChatGPT or Claude' }),
    ).toBeInTheDocument()
    const snap = document.querySelector<HTMLElement>('.bill-chat-drawer-snap')
    expect(snap?.style.height).toMatch(/^\d+(\.\d+)?px$/)

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument()
    expect(textbox()).not.toBeInTheDocument()
  })

  it('lifts a peeked drawer on Ask and leaves an open one where the reader put it', async () => {
    renderDrawer(<Presenter askLabel="ask" />)
    await screen.findByRole('dialog', { name: 'Ask about this bill' })

    fireEvent.click(screen.getByRole('button', { name: 'ask' }))
    expect(textbox()).toBeInTheDocument()
    expect(document.querySelector('.bill-chat-attachment-label')).toHaveTextContent('same passage')

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(textbox()).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ask' }))
    expect(textbox()).toBeInTheDocument()
    expect(document.querySelector('.bill-chat-drawer-inner')).toHaveAttribute('data-snap', 'half')

    // Asking again while open must not yank the sheet back to half.
    fireEvent.click(screen.getByRole('button', { name: 'ask' }))
    expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument()
  })

  it('starts peeked again when a different bill takes over', async () => {
    // Each expanded row is its own FeedRowDetail mount, hence the key.
    function App({ number }: { number: number }) {
      return (
        <BillChatLayoutProvider>
          <BillChatDrawer />
          <Presenter key={number} number={number} askLabel="ask" />
        </BillChatLayoutProvider>
      )
    }
    const { rerender } = render(<App number={2} />)
    fireEvent.click(await screen.findByRole('button', { name: 'ask' }))
    expect(textbox()).toBeInTheDocument()

    rerender(<App number={3} />)
    expect(document.querySelector('.bill-chat-drawer-inner')).toHaveAttribute('data-bill', '119-s-3')
    expect(document.querySelector('.bill-chat-drawer-inner')).toHaveAttribute('data-snap', 'peek')
    expect(textbox()).not.toBeInTheDocument()
  })

  it('hands Escape to the topmost sheet instead of swallowing it', async () => {
    renderDrawer(<Presenter />)
    await screen.findByRole('dialog', { name: 'Ask about this bill' })

    const sheet: SheetLayerController = {
      requestClose: vi.fn(),
      getIsClosing: () => false,
      panel: null,
    }
    const registration = registerSheetLayer(sheet)

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(sheet.requestClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: 'Ask about this bill' })).toBeInTheDocument()
    registration.unregister()

    // Nothing to hand off: the always-open drawer still stays put.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Ask about this bill' })).toBeInTheDocument()
  })
})
