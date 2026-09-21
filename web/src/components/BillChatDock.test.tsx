import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FeedItem } from '../api/types'
import { makeFeedItem } from '../test/feedItemFixtures'
import { mockViewport } from '../test/homeRouteHarness'
import { resetBillChatInstancesForTests } from '../utils/billChatInstance'

const sendMessage = vi.fn()

vi.mock('@ai-sdk/react', () => ({
  Chat: class Chat {},
  useChat: () => ({
    messages: [],
    status: 'ready',
    error: undefined,
    sendMessage,
    regenerate: vi.fn(),
    stop: vi.fn(),
  }),
}))

import { BillChatDock, type BillChatDockPlacement } from './BillChatDock'
import { BillChatPane } from './BillChatPane'
import {
  BILL_CHAT_RAIL_ID,
  BillChatLayoutProvider,
  usePresentBillChat,
  type BillChatSessionPayload,
} from './BillChatLayout'

function Presenter({
  item,
  pendingSelection = null,
  askNonce = 0,
}: {
  item: FeedItem
  pendingSelection?: string | null
  askNonce?: number
}) {
  const payload: BillChatSessionPayload = {
    item,
    pendingSelection,
    askNonce,
    onClearSelection: () => {},
    onSharePassage: () => {},
    onQuoteCreated: () => {},
  }
  usePresentBillChat(payload)
  return null
}

function renderHost(ui: ReactNode, placement: BillChatDockPlacement = 'rail') {
  return render(
    <BillChatLayoutProvider>
      <BillChatDock placement={placement} />
      {ui}
    </BillChatLayoutProvider>,
  )
}

describe('BillChatDock', () => {
  beforeEach(() => {
    mockViewport(true)
  })

  afterEach(() => {
    resetBillChatInstancesForTests()
    vi.restoreAllMocks()
  })

  it('renders nothing until a bill presents a session', () => {
    render(
      <BillChatLayoutProvider>
        <BillChatDock placement="rail" />
      </BillChatLayoutProvider>,
    )

    expect(screen.queryByRole('heading', { name: 'Ask about this bill' })).not.toBeInTheDocument()
  })

  it('renders the chat in the desktop rail when a bill is presented', async () => {
    renderHost(<Presenter item={makeFeedItem()} />)

    await waitFor(() => {
      expect(document.getElementById(BILL_CHAT_RAIL_ID)?.querySelector('#bill-chat-heading')).toHaveTextContent(
        'Ask about this bill',
      )
    })
    expect(document.getElementById(BILL_CHAT_RAIL_ID)).toHaveAttribute('data-bill', '119-s-2')
    expect(screen.getByRole('button', { name: 'Open this conversation in ChatGPT or Claude' })).toBeInTheDocument()
  })

  it('renders the chat pane without a rail or drawer shell', () => {
    render(
      <BillChatLayoutProvider>
        <BillChatPane />
        <Presenter item={makeFeedItem()} />
      </BillChatLayoutProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Ask about this bill' })).toBeInTheDocument()
    expect(document.getElementById(BILL_CHAT_RAIL_ID)).toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mounts a companion drawer on mobile when a bill is presented', async () => {
    mockViewport(false)
    renderHost(<Presenter item={makeFeedItem()} />, 'drawer')

    expect(await screen.findByRole('dialog', { name: 'Ask about this bill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument()
    // Open in… rides with the composer, so the peek bar is title + Open chat only.
    expect(
      screen.queryByRole('button', { name: 'Open this conversation in ChatGPT or Claude' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Ask about this bill' })).not.toBeInTheDocument()
    expect(document.querySelector('.bill-chat-drawer-inner')).toHaveAttribute('data-snap', 'peek')
  })

  it('opens and minimizes the mobile drawer from the header actions', async () => {
    mockViewport(false)
    renderHost(<Presenter item={makeFeedItem()} />, 'drawer')

    fireEvent.click(await screen.findByRole('button', { name: 'Open chat' }))
    const snap = document.querySelector('.bill-chat-drawer-snap')
    expect(snap).not.toBeNull()
    expect(snap?.querySelector('.bill-chat-prompt')).not.toBeNull()
    expect((snap as HTMLElement).style.height).toMatch(/^\d+(\.\d+)?px$/)
    expect(screen.getByRole('textbox', { name: 'Ask about this bill' })).toBeInTheDocument()
    expect(document.querySelector('.bill-chat-drawer-inner')).toHaveAttribute('data-snap', 'half')
    expect(
      screen.getByRole('button', { name: 'Open this conversation in ChatGPT or Claude' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(screen.getByRole('button', { name: 'Open chat' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Ask about this bill' })).not.toBeInTheDocument()
  })

  it('keeps only the latest presented bill and reclaims the previous source', async () => {
    const first = makeFeedItem()
    const second = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 1, title: 'Other Act' },
    })

    function App({ showSecond }: { showSecond: boolean }) {
      return (
        <BillChatLayoutProvider>
          <BillChatDock placement="rail" />
          <Presenter item={first} />
          {showSecond ? <Presenter item={second} /> : null}
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(
      <App showSecond />,
    )

    await waitFor(() => {
      expect(document.getElementById(BILL_CHAT_RAIL_ID)).toHaveAttribute('data-bill', '119-hr-1')
    })
    expect(document.querySelectorAll('.bill-chat')).toHaveLength(1)

    rerender(
      <App showSecond={false} />,
    )

    await waitFor(() => {
      expect(document.getElementById(BILL_CHAT_RAIL_ID)).toHaveAttribute('data-bill', '119-s-2')
    })
    expect(document.querySelectorAll('.bill-chat')).toHaveLength(1)
  })

  it('clears the composer draft when the occupant bill changes', async () => {
    function App({ number }: { number: number }) {
      return (
        <BillChatLayoutProvider>
          <BillChatPane />
          <Presenter
            item={makeFeedItem({
              bill: { congress: 119, type: 'S', number, title: `Bill ${number}` },
            })}
          />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(
      <App number={2} />,
    )
    const box = await screen.findByRole('textbox', { name: 'Ask about this bill' })
    fireEvent.change(box, { target: { value: 'draft for S.2' } })
    expect(box).toHaveValue('draft for S.2')

    rerender(
      <App number={3} />,
    )
    expect(screen.getByRole('textbox', { name: 'Ask about this bill' })).toHaveValue('')
  })

  it('lifts the peeked drawer when Ask repeats the same passage', async () => {
    mockViewport(false)

    function App({ askNonce }: { askNonce: number }) {
      return (
        <BillChatLayoutProvider>
          <BillChatDock placement="drawer" />
          <Presenter item={makeFeedItem()} pendingSelection="same passage" askNonce={askNonce} />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(
      <App askNonce={1} />,
    )
    expect(await screen.findByRole('textbox', { name: 'Ask about this bill' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(screen.queryByRole('textbox', { name: 'Ask about this bill' })).not.toBeInTheDocument()

    rerender(
      <App askNonce={2} />,
    )
    expect(screen.getByRole('textbox', { name: 'Ask about this bill' })).toBeInTheDocument()
  })

  it('leaves a half-open drawer in place when Ask repeats', async () => {
    mockViewport(false)

    function App({ askNonce }: { askNonce: number }) {
      return (
        <BillChatLayoutProvider>
          <BillChatDock placement="drawer" />
          <Presenter item={makeFeedItem()} pendingSelection="same passage" askNonce={askNonce} />
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(
      <App askNonce={1} />,
    )
    expect(await screen.findByRole('button', { name: 'Minimize' })).toBeInTheDocument()
    rerender(
      <App askNonce={2} />,
    )
    expect(screen.getByRole('button', { name: 'Minimize' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open chat' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Ask about this bill' })).toBeInTheDocument()
  })
})
