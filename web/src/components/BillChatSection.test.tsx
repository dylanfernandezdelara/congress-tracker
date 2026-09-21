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

const { scrollToBottom } = vi.hoisted(() => ({ scrollToBottom: vi.fn() }))

// Real StickToBottom; only the context hook's `scrollToBottom` is a spy so the
// new-turn follow inside the Conversation is observable in jsdom.
vi.mock('use-stick-to-bottom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('use-stick-to-bottom')>()
  return {
    ...mod,
    useStickToBottomContext: () => ({ ...mod.useStickToBottomContext(), scrollToBottom }),
  }
})

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
  scrollToBottom.mockReset()
})

afterEach(() => {
  resetBillChatInstancesForTests()
  vi.restoreAllMocks()
})

describe('BillChatSection', () => {
  it('renders the heading and starter chips including key-point questions', () => {
    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Ask about this bill' })).toBeInTheDocument()
    // Stock ConversationEmptyState inside the log until the first turn.
    expect(screen.getByRole('log')).toContainElement(screen.getByText('Ask about S. 2'))
    expect(screen.getByText(/Answers stay grounded/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What does this bill do?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Who is affected?' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Explain: Raises the debt ceiling/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Explain: Creates a new inspector/ }),
    ).toBeInTheDocument()
  })

  it('trims the empty state to its title in a compact log slot', () => {
    renderWithTooltip(
      <BillChatSection item={twoPointItem} compact onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />,
    )

    const empty = screen.getByText('Ask about S. 2').closest('.bill-chat-empty')
    expect(empty).not.toBeNull()
    expect(empty).toHaveTextContent(/^Ask about S\. 2$/)
    expect(empty?.querySelector('svg')).toBeNull()
  })

  it('sends a starter chip as the user message', () => {
    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'What does this bill do?' }))

    expect(sendMessage).toHaveBeenCalledWith({ text: 'What does this bill do?' })
  })

  it('scrolls the log to the bottom once a question is in flight', () => {
    chatMock.messages = [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Who pays?' }] }]
    const { rerender } = renderWithTooltip(
      <BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />,
    )
    expect(scrollToBottom).not.toHaveBeenCalled()

    chatMock.status = 'submitted'
    rerender(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)
    expect(scrollToBottom).toHaveBeenCalledTimes(1)

    chatMock.status = 'streaming'
    rerender(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)
    expect(scrollToBottom).toHaveBeenCalledTimes(1)
  })

  it('keeps a draft follow-up when Enter is pressed while a reply streams', () => {
    chatMock.status = 'streaming'
    chatMock.messages = [assistantMessage([{ type: 'text', text: 'Working' }])]
    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    const textbox = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Ask about this bill' })
    fireEvent.change(textbox, { target: { value: 'And who pays for it?' } })
    // fireEvent returns false when the default was prevented: the guard ate it.
    expect(fireEvent.keyDown(textbox, { key: 'Enter' })).toBe(false)

    expect(sendMessage).not.toHaveBeenCalled()
    expect(textbox.value).toBe('And who pays for it?')

    // An IME candidate confirm and Shift+Enter pass through untouched.
    expect(fireEvent.keyDown(textbox, { key: 'Enter', isComposing: true })).toBe(true)
    expect(fireEvent.keyDown(textbox, { key: 'Enter', shiftKey: true })).toBe(true)
    // Engines that report the confirm as keyCode 229 with isComposing false
    // reach the registry handler, which never sends while a reply streams.
    fireEvent.keyDown(textbox, { key: 'Enter', keyCode: 229 })
    expect(sendMessage).not.toHaveBeenCalled()
    expect(textbox.value).toBe('And who pays for it?')
  })

  it('lets a paste that carries a file item fall through as text', () => {
    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)
    const textbox = screen.getByRole('textbox', { name: 'Ask about this bill' })
    const clipboardData = {
      items: [
        { kind: 'file', getAsFile: () => new File(['x'], 'shot.png', { type: 'image/png' }) },
        { kind: 'string', getAsFile: () => null },
      ],
    }
    // The registry textarea would preventDefault to attach the file; the
    // composer has no attachments, so the browser paste must stay in charge.
    expect(fireEvent.paste(textbox, { clipboardData })).toBe(true)
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
    expect(screen.queryByText('Ask about S. 2')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'What does this bill do?' })).not.toBeInTheDocument()
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
    expect(notice.closest('[data-refused]')).toBeTruthy()
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

  it('renders a pending selection chip and sends it on submit, then clears it', async () => {
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
    // PromptInput reads the message off FormData and resolves attachments before onSubmit.
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        { text: 'What does this mean?' },
        { body: { selection: 'the selected text about rural clinics' } },
      ),
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

    const trigger = screen.getByRole('button', { name: 'Open this conversation in ChatGPT or Claude' })
    expect(trigger).toHaveTextContent('Open in')
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

  it('exports the thread as signed answers, not streamed fragments or citations', async () => {
    chatMock.messages = [
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'What does it do?' }] },
      assistantMessage([
        { type: 'text', text: 'The bill ' },
        { type: 'data-quote', data: quotePart() },
        { type: 'text', text: ' raises it.' },
        { type: 'data-answer', data: answerPart() },
      ]),
    ]
    renderWithTooltip(<BillChatSection item={twoPointItem} onSharePassage={vi.fn()} onQuoteCreated={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Open this conversation in ChatGPT or Claude' })
    fireEvent.pointerDown(trigger)
    fireEvent.pointerUp(trigger)
    fireEvent.click(trigger)

    const chatgpt = await screen.findByRole('menuitem', { name: /Open in ChatGPT/ })
    const prompt = new URL(chatgpt.getAttribute('href') ?? '').searchParams.get('prompt') ?? ''
    expect(prompt).toContain('Conversation so far:\n\nUser:\nWhat does it do?')
    expect(prompt).toContain('Assistant:\nThe bill raises the spending cap.')
    expect(prompt).not.toContain('The bill  raises it.')
    expect(prompt).not.toContain('The Secretary shall raise the cap.')
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
