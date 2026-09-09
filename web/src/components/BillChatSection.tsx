import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'
import {
  BILL_CHAT_MAX_QUESTION_CHARS,
  BILL_CHAT_UNVERIFIED_PLACEHOLDER,
  type BillChatAnswerData,
  type BillChatQuoteData,
} from '@congress-tracker/shared/chat-api-types'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { buildApiUrl } from '../api/fetchJson'
import type { FeedItem } from '../api/types'
import { assertNever } from '../utils/assertNever'
import {
  capSelection,
  evidenceSourceLabel,
  parseChatErrorMessage,
  selectionChipLabel,
  splitProseParagraphs,
  starterChipsFromKeyPoints,
} from '../utils/billChat'
import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from './ai-elements/attachments'
import { Conversation, ConversationContent } from './ai-elements/conversation'
import { Message, MessageContent } from './ai-elements/message'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from './ai-elements/prompt-input'
import { Suggestion, Suggestions } from './ai-elements/suggestion'
import { Button } from './ui/button'

export type BillChatMessage = UIMessage<
  unknown,
  { quote: BillChatQuoteData; answer: BillChatAnswerData }
>

type RenderablePart =
  | { type: 'text'; text: string }
  | { type: 'data-quote'; data: BillChatQuoteData }
  | { type: 'data-answer'; data: BillChatAnswerData }
  | { type: 'source-document' }

export type BillChatSectionHandle = {
  getAnswer(messageId: string): BillChatAnswerData | undefined
}

export type BillChatSectionProps = {
  item: FeedItem
  pendingSelection?: string | null
  onClearSelection?: () => void
  onSharePassage: (text: string) => void
}

type QuotedPassageProps = {
  quote: BillChatQuoteData
  onSharePassage: (text: string) => void
}

export function QuotedPassage({ quote, onSharePassage }: QuotedPassageProps) {
  const sourceName = evidenceSourceLabel(quote.source)
  const meta =
    quote.section_label && quote.section_label !== sourceName
      ? `${quote.section_label} · ${sourceName}`
      : quote.section_label || sourceName

  return (
    <figure className="bill-chat-quote">
      <blockquote className="bill-chat-quote-text">{quote.text}</blockquote>
      <figcaption className="bill-chat-quote-meta">{meta}</figcaption>
      <button
        type="button"
        className="bill-chat-quote-share"
        onClick={() => onSharePassage(quote.text)}
      >
        Share this passage
      </button>
    </figure>
  )
}

function asRenderablePart(part: BillChatMessage['parts'][number]): RenderablePart | null {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text }
    case 'data-quote':
      return { type: 'data-quote', data: part.data }
    case 'data-answer':
      return { type: 'data-answer', data: part.data }
    case 'source-document':
      return { type: 'source-document' }
    default:
      return null
  }
}

function renderUnverifiedProse(text: string): ReactNode {
  const pieces = text.split(BILL_CHAT_UNVERIFIED_PLACEHOLDER)
  return pieces.map((chunk, index) => (
    <span key={`prose-${index}`}>
      {chunk}
      {index < pieces.length - 1 ? (
        <span className="bill-chat-unverified">{BILL_CHAT_UNVERIFIED_PLACEHOLDER}</span>
      ) : null}
    </span>
  ))
}

function userMessageText(message: BillChatMessage): string {
  return message.parts
    .filter((part): part is Extract<BillChatMessage['parts'][number], { type: 'text' }> => {
      return part.type === 'text'
    })
    .map((part) => part.text)
    .join('')
}

function messageAnswer(message: BillChatMessage): BillChatAnswerData | undefined {
  for (const part of message.parts) {
    if (part.type === 'data-answer') return part.data
  }
  return undefined
}

function AssistantParts({
  message,
  streaming,
  onSharePassage,
}: {
  message: BillChatMessage
  streaming: boolean
  onSharePassage: (text: string) => void
}) {
  const answer = messageAnswer(message)
  const refused = answer?.refused === true

  return (
    <MessageContent
      className={
        refused ? 'bill-chat-bubble bill-chat-bubble--refused' : 'bill-chat-bubble bill-chat-bubble--assistant'
      }
    >
      {message.parts.map((raw, index) => {
        const part = asRenderablePart(raw)
        if (!part) return null
        switch (part.type) {
          case 'text':
            return (
              <div
                key={`${message.id}-text-${index}`}
                className="bill-chat-prose"
                data-quotable="answer"
                data-quotable-id={message.id}
              >
                {splitProseParagraphs(part.text).map((paragraph, paragraphIndex) => (
                  <p key={`${message.id}-p-${paragraphIndex}`}>{renderUnverifiedProse(paragraph)}</p>
                ))}
              </div>
            )
          case 'data-quote':
            return refused ? null : (
              <QuotedPassage
                key={`${message.id}-quote-${part.data.sourceId}`}
                quote={part.data}
                onSharePassage={onSharePassage}
              />
            )
          case 'data-answer':
          case 'source-document':
            return null
          default:
            return assertNever(part)
        }
      })}
      {streaming ? (
        <p className="bill-chat-streaming" aria-live="polite">
          <span className="bill-chat-streaming-dot" />
          Answering…
        </p>
      ) : null}
    </MessageContent>
  )
}

export const BillChatSection = forwardRef<BillChatSectionHandle, BillChatSectionProps>(
  function BillChatSection(
    { item, pendingSelection = null, onClearSelection, onSharePassage },
    ref,
  ) {
    const billId = formatBillQueryParam(item.bill)
    const sectionRef = useRef<HTMLElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [input, setInput] = useState('')
    const transport = useMemo(
      () =>
        new DefaultChatTransport({
          api: buildApiUrl('/chat/bill'),
          body: { bill: billId },
        }),
      [billId],
    )
    const { messages, sendMessage, status, stop, error, regenerate } = useChat<BillChatMessage>({
      id: `bill-chat-${billId}`,
      transport,
    })

    useImperativeHandle(
      ref,
      () => ({
        getAnswer(messageId: string) {
          const message = messages.find((entry) => entry.id === messageId)
          return message ? messageAnswer(message) : undefined
        },
      }),
      [messages],
    )

    useEffect(() => {
      if (!pendingSelection) return
      sectionRef.current?.scrollIntoView?.({ block: 'nearest' })
      textareaRef.current?.focus()
    }, [pendingSelection])

    const streaming = status === 'submitted' || status === 'streaming'
    const starters = useMemo(
      () => starterChipsFromKeyPoints(item.digest?.key_points),
      [item.digest?.key_points],
    )
    const errorText = parseChatErrorMessage(error)
    const attachedSelection = pendingSelection ? capSelection(pendingSelection) : null

    const submitQuestion = useCallback(
      (raw: string) => {
        const text = raw.trim().slice(0, BILL_CHAT_MAX_QUESTION_CHARS)
        if (!text || streaming) return
        if (attachedSelection) {
          void sendMessage({ text }, { body: { selection: attachedSelection } })
          onClearSelection?.()
        } else {
          void sendMessage({ text })
        }
        setInput('')
      },
      [attachedSelection, onClearSelection, sendMessage, streaming],
    )

    return (
      <section ref={sectionRef} className="feed-row-detail-section bill-chat" aria-labelledby="bill-chat-heading">
        <h3 id="bill-chat-heading" className="feed-row-detail-heading">
          Ask about this bill
        </h3>
        <p className="bill-chat-note">Answers quote the bill’s text.</p>

        {messages.length === 0 ? (
          <Suggestions>
            {starters.map((chip) => (
              <Suggestion
                key={chip}
                suggestion={chip}
                disabled={streaming}
                onClick={(value) => submitQuestion(value)}
              />
            ))}
          </Suggestions>
        ) : null}

        {messages.length > 0 ? (
          <Conversation>
            <ConversationContent>
              {messages.map((message, index) => {
                if (message.role === 'user') {
                  return (
                    <Message key={message.id} from="user">
                      <MessageContent className="bill-chat-bubble bill-chat-bubble--user">
                        {userMessageText(message)}
                      </MessageContent>
                    </Message>
                  )
                }
                if (message.role === 'assistant') {
                  const isLast = index === messages.length - 1
                  return (
                    <Message key={message.id} from="assistant">
                      <AssistantParts
                        message={message}
                        streaming={isLast && status === 'streaming'}
                        onSharePassage={onSharePassage}
                      />
                    </Message>
                  )
                }
                return null
              })}
            </ConversationContent>
          </Conversation>
        ) : null}

        {errorText ? (
          <div className="bill-chat-error" role="alert">
            <span>{errorText}</span>
            <button type="button" className="bill-chat-error-retry" onClick={() => void regenerate()}>
              Retry
            </button>
          </div>
        ) : null}

        {attachedSelection ? (
          <Attachments>
            <Attachment
              label={selectionChipLabel(attachedSelection)}
              title={attachedSelection}
              onRemove={onClearSelection}
            >
              <AttachmentPreview />
              <AttachmentInfo />
              <AttachmentRemove />
            </Attachment>
          </Attachments>
        ) : null}

        <PromptInput disabled={streaming} onSubmit={() => submitQuestion(input)}>
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, BILL_CHAT_MAX_QUESTION_CHARS))}
            maxLength={BILL_CHAT_MAX_QUESTION_CHARS}
            aria-label="Ask about this bill"
            placeholder="Ask a question about this bill"
          />
          <PromptInputFooter>
            {streaming ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="bill-chat-prompt-stop"
                onClick={() => stop()}
              >
                Stop
              </Button>
            ) : (
              <PromptInputSubmit disabled={input.trim().length === 0} />
            )}
          </PromptInputFooter>
        </PromptInput>
      </section>
    )
  },
)
