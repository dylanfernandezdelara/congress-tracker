import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FeedItem } from '../api/types'
import { makeFeedItem } from '../test/feedItemFixtures'
import { mockViewport } from '../test/homeRouteHarness'

const sendMessage = vi.fn()

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    status: 'ready',
    error: undefined,
    sendMessage,
    regenerate: vi.fn(),
    stop: vi.fn(),
  }),
}))

import { BillChatDock } from './BillChatDock'
import {
  BILL_CHAT_RAIL_ID,
  BillChatLayoutProvider,
  usePresentBillChat,
  type BillChatSessionPayload,
} from './BillChatLayout'

function Presenter({
  item,
  pendingSelection = null,
}: {
  item: FeedItem
  pendingSelection?: string | null
}) {
  const payload: BillChatSessionPayload = {
    item,
    pendingSelection,
    onClearSelection: () => {},
    onSharePassage: () => {},
    onQuoteCreated: () => {},
  }
  usePresentBillChat(payload)
  return null
}

function renderHost(
  ui: ReactNode,
  options: { isDesktop?: boolean; placement?: 'rail' | 'drawer' | 'inline' } = {},
) {
  const { isDesktop = true, placement } = options
  return render(
    <BillChatLayoutProvider>
      <BillChatDock isDesktop={isDesktop} placement={placement} />
      {ui}
    </BillChatLayoutProvider>,
  )
}

describe('BillChatDock', () => {
  beforeEach(() => {
    mockViewport(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing until a bill presents a session', () => {
    render(
      <BillChatLayoutProvider>
        <BillChatDock isDesktop />
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
    expect(screen.getByRole('button', { name: 'Open in chat' })).toBeInTheDocument()
  })

  it('keeps the chat inline when tests opt out of the rail and drawer', () => {
    renderHost(<Presenter item={makeFeedItem()} />, { isDesktop: false, placement: 'inline' })

    expect(screen.getByRole('heading', { name: 'Ask about this bill' }).closest('.bill-chat-dock--inline')).toBeTruthy()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mounts a companion drawer on mobile when a bill is presented', async () => {
    mockViewport(false)
    renderHost(<Presenter item={makeFeedItem()} />, { isDesktop: false })

    expect(await screen.findByRole('dialog', { name: 'Ask about this bill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open in chat' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Ask about this bill' })).not.toBeInTheDocument()
  })

  it('opens and minimizes the mobile drawer from the header actions', async () => {
    mockViewport(false)
    renderHost(<Presenter item={makeFeedItem()} />, { isDesktop: false })

    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(screen.getByRole('textbox', { name: 'Ask about this bill' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
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
          <BillChatDock isDesktop />
          <Presenter item={first} />
          {showSecond ? <Presenter item={second} /> : null}
        </BillChatLayoutProvider>
      )
    }

    const { rerender } = render(<App showSecond />)

    await waitFor(() => {
      expect(document.getElementById(BILL_CHAT_RAIL_ID)).toHaveAttribute('data-bill', '119-hr-1')
    })
    expect(document.querySelectorAll('.bill-chat')).toHaveLength(1)

    rerender(<App showSecond={false} />)

    await waitFor(() => {
      expect(document.getElementById(BILL_CHAT_RAIL_ID)).toHaveAttribute('data-bill', '119-s-2')
    })
    expect(document.querySelectorAll('.bill-chat')).toHaveLength(1)
  })
})
