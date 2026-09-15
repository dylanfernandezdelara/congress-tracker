import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BILL_CHAT_STREAM_ERROR_TEXT,
  type BillChatAnswerData,
  type BillChatQuoteData,
} from '@congress-tracker/shared/chat-api-types'

import { makeFeedItem } from '../test/feedItemFixtures'
import { renderWithTooltip } from '../test/tooltipHarness'
import { resetBillChatInstancesForTests } from '../utils/billChatInstance'
import type { BillChatMessage } from './BillChatSection'

const sendMessage = vi.fn()
const regenerate = vi.fn()
const stop = vi.fn()

const chatMock: {
  messages: BillChatMessage[]
  status: 'ready' | 'submitted' | 'streaming' | 'error'
  error: Error | undefined
  sendMessage: typeof sendMessage
  regenerate: typeof regenerate
  stop: typeof stop
} = {
  messages: [],
  status: 'ready',
  error: undefined,
  sendMessage,
  regenerate,
  stop,
}

vi.mock('@ai-sdk/react', () => ({
  Chat: class Chat {},
  useChat: () => chatMock,
}))

import { BillChatSection } from './BillChatSection'

const twoPointItem = makeFeedItem({
  digest: {
    headline: 'Plain headline for readers',
    what_it_does: 'It does something important in plain language.',
    key_points: [
      'Raises the debt ceiling for rural hospitals',
      'Creates a new inspector general office',
    ],
    terms_explained: [],
  },
})

function quotePart(): BillChatQuoteData {
  return {
    sourceId: 'src-1',
    text: 'The Secretary shall raise the cap.',
    section_label: 'Sec. 3. Definitions',
    source: 'bill_text',
  }
}

function answerPart(overrides: Partial<BillChatAnswerData> = {}): BillChatAnswerData {
  return {
    text: 'The bill raises the spending cap.',
    sig: 'abc123',
    unverified_quotes: 0,
    refused: false,
    ...overrides,
  }
}

function assistantMessage(parts: BillChatMessage['parts']): BillChatMessage {
  return { id: 'asst-1', role: 'assistant', parts }
}

beforeEach(() => {
  chatMock.messages = []
  chatMock.status = 'ready'
  chatMock.error = undefined
  sendMessage.mockReset()
  regenerate.mockReset()
  stop.mockReset()
})

afterEach(() => {
  resetBillChatInstancesForTests()
  vi.restoreAllMocks()
})

describe('BillChatSection', () => {
  it('renders the heading and starter chips including key-point questions', () => {
    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Ask about this bill' })).toBeInTheDocument()
    expect(screen.queryByText('Answers quote the bill’s text.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What does this bill do?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Who is affected?' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Explain: Raises the debt ceiling/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Explain: Creates a new inspector/ }),
    ).toBeInTheDocument()
  })

  it('sends a starter chip as the user message', () => {
    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'What does this bill do?' }))

    expect(sendMessage).toHaveBeenCalledWith({ text: 'What does this bill do?' })
  })

  it('renders prose, a quoted passage, and shares the passage text', () => {
    const onSharePassage = vi.fn()
    chatMock.messages = [
      assistantMessage([
        { type: 'text', text: 'The bill raises the spending cap.' },
        { type: 'data-quote', id: 'src-1', data: quotePart() },
        { type: 'data-answer', data: answerPart() },
      ]),
    ]

    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={onSharePassage} onQuoteCreated={vi.fn()} />)

    expect(screen.getByText('The bill raises the spending cap.')).toBeInTheDocument()
    expect(screen.getByText('The Secretary shall raise the cap.')).toBeInTheDocument()
    expect(screen.getByText(/Sec\. 3\. Definitions/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Share this passage' }))
    expect(onSharePassage).toHaveBeenCalledWith('The Secretary shall raise the cap.')
  })

  it('renders a refused answer as a notice without quote share', () => {
    chatMock.messages = [
      assistantMessage([
        { type: 'text', text: "The bill text doesn't address this." },
        { type: 'data-answer', data: answerPart({ refused: true, sig: null }) },
      ]),
    ]

    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    const notice = screen.getByText("The bill text doesn't address this.")
    expect(notice.closest('.bill-chat-bubble--refused')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Share this passage' })).not.toBeInTheDocument()
  })

  it('shows the parsed error message and retries', () => {
    chatMock.error = new Error(JSON.stringify({ message: 'Too many questions today.' }))

    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Too many questions today.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(regenerate).toHaveBeenCalled()
  })

  it('shows a generic error when the transport message is not JSON', () => {
    chatMock.error = new Error('Failed to fetch')

    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Chat is unavailable right now.')
  })

  it("shows the worker's stream error copy when the model call fails mid-stream", () => {
    // The UI-message-stream `error` part surfaces as a plain Error whose
    // message is the worker's errorText, not a JSON body.
    chatMock.error = new Error(BILL_CHAT_STREAM_ERROR_TEXT)

    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('The chat service failed. Try again shortly.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('renders a pending selection chip and sends it on submit, then clears it', () => {
    const onClearSelection = vi.fn()
    renderWithTooltip(
      <BillChatSection
        item={twoPointItem}
        pendingSelection="the selected text about rural clinics"
        onClearSelection={onClearSelection}
        onSharePassage={vi.fn()}
        onQuoteCreated={vi.fn()}
      />,
    )

    expect(screen.getByText('the selected text about rural clinics')).toBeInTheDocument()
    const textarea = screen.getByRole('textbox', { name: 'Ask about this bill' })
    fireEvent.change(textarea, { target: { value: 'What does this mean?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(sendMessage).toHaveBeenCalledWith(
      { text: 'What does this mean?' },
      { body: { selection: 'the selected text about rural clinics' } },
    )
    expect(onClearSelection).toHaveBeenCalled()
  })

  it('hides the composer when collapsed', () => {
    renderWithTooltip(
      <BillChatSection
        item={twoPointItem}
        collapsed
        onSharePassage={vi.fn()}
        onQuoteCreated={vi.fn()}
        headerActions={<button type="button">Open</button>}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Ask about this bill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Ask about this bill' })).not.toBeInTheDocument()
  })

  it('opens ChatGPT and Claude with a bill briefing', async () => {
    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Continue this bill in ChatGPT or Claude' })
    expect(trigger).toHaveTextContent('Continue in…')
    expect(trigger).not.toHaveTextContent('Open in chat')
    fireEvent.pointerDown(trigger)
    fireEvent.pointerUp(trigger)
    fireEvent.click(trigger)

    const chatgpt = await screen.findByRole('menuitem', { name: /Open in ChatGPT/ })
    const claude = screen.getByRole('menuitem', { name: /Open in Claude/ })
    const chatgptHref = chatgpt.getAttribute('href') ?? ''
    const claudeHref = claude.getAttribute('href') ?? ''
    expect(chatgptHref).toContain('https://chatgpt.com/?')
    expect(new URL(chatgptHref).searchParams.get('prompt')).toContain('S. 2')
    expect(claudeHref).toContain('https://claude.ai/new?')
    expect(new URL(claudeHref).searchParams.get('q')).toContain('S. 2')
    expect(screen.getByRole('menuitem', { name: 'Copy briefing' })).toBeInTheDocument()
    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })

  it('shows Stop while streaming and disables send', () => {
    chatMock.status = 'streaming'
    chatMock.messages = [assistantMessage([{ type: 'text', text: 'Working' }])]

    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(stop).toHaveBeenCalled()
  })
})
