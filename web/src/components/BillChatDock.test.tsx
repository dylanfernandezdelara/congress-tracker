import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import { BILL_CHAT_RAIL_ID, BillChatLayoutProvider } from './BillChatLayout'

function renderDock() {
  return render(
    <BillChatLayoutProvider>
      <div id={BILL_CHAT_RAIL_ID} className="bill-chat-rail" />
      <BillChatDock
        item={makeFeedItem()}
        onSharePassage={vi.fn()}
        onQuoteCreated={vi.fn()}
      />
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

  it('portals the chat into the desktop rail mount', async () => {
    renderDock()

    await waitFor(() => {
      expect(document.getElementById(BILL_CHAT_RAIL_ID)?.querySelector('#bill-chat-heading')).toHaveTextContent(
        'Ask about this bill',
      )
    })
    expect(screen.getByRole('button', { name: 'Open in chat' })).toBeInTheDocument()
  })

  it('keeps the chat inline when the desktop rail is not claimed', () => {
    mockViewport(false)
    render(
      <BillChatDock item={makeFeedItem()} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />,
    )

    expect(screen.getByRole('heading', { name: 'Ask about this bill' }).closest('.bill-chat-dock--inline')).toBeTruthy()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mounts a companion drawer on mobile when the layout is claimed', async () => {
    mockViewport(false)
    renderDock()

    expect(await screen.findByRole('dialog', { name: 'Ask about this bill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open in chat' })).toBeInTheDocument()
  })

  it('keeps only the latest expanded bill in the desktop rail', async () => {
    const first = makeFeedItem()
    const second = makeFeedItem({
      bill: { congress: 119, type: 'HR', number: 1, title: 'Other Act' },
    })
    render(
      <BillChatLayoutProvider>
        <div id={BILL_CHAT_RAIL_ID} className="bill-chat-rail" />
        <BillChatDock item={first} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />
        <BillChatDock item={second} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />
      </BillChatLayoutProvider>,
    )

    await waitFor(() => {
      expect(document.getElementById(BILL_CHAT_RAIL_ID)?.querySelectorAll('.bill-chat')).toHaveLength(1)
    })
    expect(document.querySelectorAll('.bill-chat')).toHaveLength(1)
  })
})
