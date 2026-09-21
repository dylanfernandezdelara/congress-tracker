import {
  type BillChatAnswerData,
  type BillChatQuoteData,
} from '@congress-tracker/shared/chat-api-types'
import type { UIMessage } from 'ai'
import { MessageSquareTextIcon } from 'lucide-react'
import { useEffect } from 'react'
import { useStickToBottomContext } from 'use-stick-to-bottom'

import { evidenceSourceLabel } from '../utils/billChat'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from './ai-elements/conversation'
import { Loader } from './ai-elements/loader'
import { Message, MessageContent, MessageResponse } from './ai-elements/message'
import { Button } from './ui/button'

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

function messageText(message: BillChatMessage, separator: string): string {
  return message.parts
    .filter((part): part is Extract<BillChatPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join(separator)
}

/** Plain text of a turn for export / Open in ChatGPT or Claude. */
export function messagePlainText(message: BillChatMessage): string {
  if (message.role === 'user') return messageText(message, '')
  const answer = messageAnswer(message)
  if (answer?.text.trim()) return answer.text.trim()
  return messageText(message, '\n\n').trim()
}

type QuotedPassageProps = {
  quote: BillChatQuoteData
  onSharePassage: (text: string) => void
}

/** Verified verbatim passage the answer cites, with its section label. */
export function QuotedPassage({ quote, onSharePassage }: QuotedPassageProps) {
  const sourceName = evidenceSourceLabel(quote.source)
  const meta =
    quote.section_label && quote.section_label !== sourceName
      ? `${quote.section_label} · ${sourceName}`
      : quote.section_label || sourceName

  return (
    <figure className="my-0 flex min-w-0 flex-col gap-1 border-l-2 border-law pl-3">
      <blockquote className="m-0 text-sm italic leading-relaxed text-foreground">
        {quote.text}
      </blockquote>
      <figcaption className="text-xs font-medium text-faint">{meta}</figcaption>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 w-fit rounded-full px-2.5 text-xs text-muted-foreground"
        onClick={() => onSharePassage(quote.text)}
      >
        Share this passage
      </Button>
    </figure>
  )
}

function AssistantTurn({
  message,
  onSharePassage,
}: {
  message: BillChatMessage
  onSharePassage: (text: string) => void
}) {
  const refused = messageAnswer(message)?.refused === true

  return (
    <MessageContent
      className={refused ? 'text-muted-foreground' : undefined}
      data-refused={refused || undefined}
    >
      {message.parts.map((part, index) => {
        switch (part.type) {
          case 'text':
            return (
              <div
                key={`${message.id}-text-${index}`}
                className="min-w-0"
                data-quotable="answer"
                data-quotable-id={message.id}
              >
                <MessageResponse>{part.text}</MessageResponse>
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
    </MessageContent>
  )
}

type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error'

/**
 * A reader scrolled up in the log has escaped StickToBottom's lock. Each new
 * question (`status` → `submitted`) re-engages it so the answer streams into
 * view. Lives inside `Conversation` so the scroll context never leaves it.
 */
function FollowNewTurn({ status }: { status: ChatStatus }) {
  const { scrollToBottom } = useStickToBottomContext()
  useEffect(() => {
    if (status === 'submitted') void scrollToBottom()
  }, [scrollToBottom, status])
  return null
}

const EMPTY_STATE_DESCRIPTION =
  'Answers stay grounded in the bill’s text. Start with a suggestion or type your own question.'

export type BillChatTranscriptProps = {
  messages: BillChatMessage[]
  status: ChatStatus
  onSharePassage: (text: string) => void
  /** Short bill label for the empty-state title, e.g. "H.R. 1". */
  billLabel: string
  /** Short log slot (mobile half snap): keep only the empty-state title. */
  compact?: boolean
}

export function BillChatTranscript({
  messages,
  status,
  onSharePassage,
  billLabel,
  compact = false,
}: BillChatTranscriptProps) {
  const lastMessage = messages[messages.length - 1]
  const awaitingReply =
    status === 'submitted' || (status === 'streaming' && lastMessage?.role !== 'assistant')

  return (
    <Conversation className="bill-chat-conversation">
      <FollowNewTurn status={status} />
      <ConversationContent className="gap-4 p-0" scrollClassName="overscroll-contain">
        {messages.length === 0 ? (
          <ConversationEmptyState
            className="bill-chat-empty gap-1 p-0 lg:p-2"
            icon={compact ? undefined : <MessageSquareTextIcon className="size-6" aria-hidden />}
            title={`Ask about ${billLabel}`}
            description={compact ? undefined : EMPTY_STATE_DESCRIPTION}
          />
        ) : null}
        {messages.map((message) => {
          switch (message.role) {
            case 'user':
              return (
                <Message key={message.id} from="user">
                  <MessageContent>{messageText(message, '')}</MessageContent>
                </Message>
              )
            case 'assistant':
              return (
                <Message key={message.id} from="assistant">
                  <AssistantTurn message={message} onSharePassage={onSharePassage} />
                </Message>
              )
            case 'system':
              return null
            default: {
              const _exhaustive: never = message.role
              return _exhaustive
            }
          }
        })}
        {awaitingReply ? (
          // Where the answer will land. MessageContent is `w-fit overflow-hidden`,
          // so the spinner's rotating bounding box cannot extend the scroll area:
          // a stretched, unclipped `animate-spin` bounces scrollHeight and makes
          // StickToBottom read the clamp as a manual scroll up, releasing its lock.
          <Message from="assistant">
            <MessageContent>
              <Loader className="text-muted-foreground" role="status" aria-label="Answering" />
            </MessageContent>
          </Message>
        ) : null}
      </ConversationContent>
      {messages.length > 0 ? <ConversationScrollButton aria-label="Scroll to latest" /> : null}
    </Conversation>
  )
}
