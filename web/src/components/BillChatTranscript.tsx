import {
  BILL_CHAT_UNVERIFIED_PLACEHOLDER,
  type BillChatAnswerData,
  type BillChatQuoteData,
} from '@congress-tracker/shared/chat-api-types'
import type { UIMessage } from 'ai'
import type { ReactNode } from 'react'

import { evidenceSourceLabel, splitProseParagraphs } from '../utils/billChat'

export type BillChatMessage = UIMessage<
  unknown,
  { quote: BillChatQuoteData; answer: BillChatAnswerData }
>

type BillChatPart = BillChatMessage['parts'][number]

/** Final `data-answer` part of an assistant turn, if the stream reached it. */
export function messageAnswer(message: BillChatMessage): BillChatAnswerData | undefined {
  for (const part of message.parts) {
    if (part.type === 'data-answer') return part.data
  }
  return undefined
}

function userMessageText(message: BillChatMessage): string {
  return message.parts
    .filter((part): part is Extract<BillChatPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('')
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

type QuotedPassageProps = {
  quote: BillChatQuoteData
  onSharePassage: (text: string) => void
}

/** B2 inline citation: indented verbatim passage with its section label. */
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

function AssistantBubble({
  message,
  streaming,
  onSharePassage,
}: {
  message: BillChatMessage
  streaming: boolean
  onSharePassage: (text: string) => void
}) {
  const refused = messageAnswer(message)?.refused === true

  return (
    <div
      className={`bill-chat-message-content bill-chat-bubble ${
        refused ? 'bill-chat-bubble--refused' : 'bill-chat-bubble--assistant'
      }`}
    >
      {message.parts.map((part, index) => {
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
            return null
          default:
            // `UIMessage.parts` is the SDK's open union (`step-start`, tool
            // parts…); the worker only emits the three cases above.
            return null
        }
      })}
      {streaming ? (
        <p className="bill-chat-streaming" aria-live="polite">
          <span className="bill-chat-streaming-dot" />
          Answering…
        </p>
      ) : null}
    </div>
  )
}

export type BillChatTranscriptProps = {
  messages: BillChatMessage[]
  status: 'submitted' | 'streaming' | 'ready' | 'error'
  onSharePassage: (text: string) => void
}

export function BillChatTranscript({ messages, status, onSharePassage }: BillChatTranscriptProps) {
  if (messages.length === 0) return null
  return (
    <div className="bill-chat-conversation" role="log">
      <div className="bill-chat-conversation-content">
        {messages.map((message, index) => {
          if (message.role === 'user') {
            return (
              <div key={message.id} className="bill-chat-message bill-chat-message--user" data-from="user">
                <div className="bill-chat-message-content bill-chat-bubble bill-chat-bubble--user">
                  {userMessageText(message)}
                </div>
              </div>
            )
          }
          if (message.role === 'assistant') {
            return (
              <div
                key={message.id}
                className="bill-chat-message bill-chat-message--assistant"
                data-from="assistant"
              >
                <AssistantBubble
                  message={message}
                  streaming={index === messages.length - 1 && status === 'streaming'}
                  onSharePassage={onSharePassage}
                />
              </div>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}
