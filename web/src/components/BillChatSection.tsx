import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'
import { BILL_CHAT_MAX_QUESTION_CHARS } from '@congress-tracker/shared/chat-api-types'
import type { BillQuote } from '@congress-tracker/shared/share-api-types'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { FileTextIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { createBillQuote } from '../api/client'
import { buildApiUrl } from '../api/fetchJson'
import type { FeedItem } from '../api/types'
import { useTextSelectionMenu, type TextSelection } from '../hooks/useTextSelectionMenu'
import {
  capSelection,
  parseChatErrorMessage,
  selectionChipLabel,
  starterChipsFromKeyPoints,
} from '../utils/billChat'
import { copyTextToClipboard } from '../utils/billDeepLink'
import { shareQuoteErrorCopy } from '../utils/shareQuoteCopy'
import { BillChatTranscript, messageAnswer, type BillChatMessage } from './BillChatTranscript'
import { SelectionMenu } from './SelectionMenu'
import { Button } from './ui/button'

export type { BillChatMessage } from './BillChatTranscript'

/** Selections inside answer bubbles are shared here, signed; the detail panel handles bill text. */
const ANSWER_SELECTION_SOURCES = ['answer'] as const
const SELECTION_STATUS_MS = 1800

export type BillChatSectionProps = {
  item: FeedItem
  /** Text the reader picked with "Ask about this"; shown as a chip and sent with the next question. */
  pendingSelection?: string | null
  onClearSelection?: () => void
  /** Reader tapped "Share this passage" under a verified quote (bill text, unsigned). */
  onSharePassage: (text: string) => void
  /** A signed answer selection was minted as a quote; the caller opens the share sheet. */
  onQuoteCreated: (quote: BillQuote) => void
}

export function BillChatSection({
  item,
  pendingSelection = null,
  onClearSelection,
  onSharePassage,
  onQuoteCreated,
}: BillChatSectionProps) {
  const billId = formatBillQueryParam(item.bill)
  const sectionRef = useRef<HTMLElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [input, setInput] = useState('')
  const [selectionStatus, setSelectionStatus] = useState<string | null>(null)
  const [sharingAnswer, setSharingAnswer] = useState(false)
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
  const { selection, clear: clearSelection } = useTextSelectionMenu(sectionRef, {
    sources: ANSWER_SELECTION_SOURCES,
  })

  useEffect(() => {
    if (!pendingSelection) return
    sectionRef.current?.scrollIntoView?.({ block: 'nearest' })
    textareaRef.current?.focus()
  }, [pendingSelection])

  useEffect(() => {
    if (!selectionStatus) return
    const timer = window.setTimeout(() => setSelectionStatus(null), SELECTION_STATUS_MS)
    return () => window.clearTimeout(timer)
  }, [selectionStatus])

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

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitQuestion(input)
    }
  }

  /** Answer prose is only shareable with the worker's bill-bound signature. */
  const shareAnswerSelection = async (current: TextSelection) => {
    const message = messages.find((entry) => entry.id === current.sourceId)
    const answer = message ? messageAnswer(message) : undefined
    if (!answer?.sig) {
      setSelectionStatus('Sharing chat answers is unavailable')
      return
    }
    setSharingAnswer(true)
    try {
      const { quote } = await createBillQuote({
        bill: billId,
        text: current.text,
        answer: { text: answer.text, sig: answer.sig },
      })
      clearSelection()
      onQuoteCreated(quote)
    } catch (err) {
      setSelectionStatus(shareQuoteErrorCopy(err))
    } finally {
      setSharingAnswer(false)
    }
  }

  return (
    <section ref={sectionRef} className="feed-row-detail-section bill-chat" aria-labelledby="bill-chat-heading">
      <h3 id="bill-chat-heading" className="feed-row-detail-heading">
        Ask about this bill
      </h3>
      <p className="bill-chat-note">Answers quote the bill’s text.</p>

      {messages.length === 0 ? (
        <div className="bill-chat-suggestions">
          {starters.map((chip) => (
            <Button
              key={chip}
              type="button"
              size="sm"
              variant="outline"
              className="bill-chat-suggestion"
              disabled={streaming}
              onClick={() => submitQuestion(chip)}
            >
              {chip}
            </Button>
          ))}
        </div>
      ) : null}

      <BillChatTranscript messages={messages} status={status} onSharePassage={onSharePassage} />

      {errorText ? (
        <div className="bill-chat-error" role="alert">
          <span>{errorText}</span>
          <button type="button" className="bill-chat-error-retry" onClick={() => void regenerate()}>
            Retry
          </button>
        </div>
      ) : null}

      {attachedSelection ? (
        <div className="bill-chat-attachments">
          <div className="bill-chat-attachment" title={attachedSelection}>
            <span className="bill-chat-attachment-icon" aria-hidden>
              <FileTextIcon />
            </span>
            <span className="bill-chat-attachment-label" title={attachedSelection}>
              {selectionChipLabel(attachedSelection)}
            </span>
            {onClearSelection ? (
              <button
                type="button"
                className="bill-chat-attachment-remove"
                aria-label="Remove"
                onClick={onClearSelection}
              >
                <XIcon />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <form
        className="bill-chat-prompt"
        onSubmit={(event) => {
          event.preventDefault()
          submitQuestion(input)
        }}
      >
        <textarea
          ref={textareaRef}
          className="bill-chat-prompt-textarea"
          rows={2}
          value={input}
          disabled={streaming}
          onChange={(event) => setInput(event.target.value.slice(0, BILL_CHAT_MAX_QUESTION_CHARS))}
          onKeyDown={onTextareaKeyDown}
          maxLength={BILL_CHAT_MAX_QUESTION_CHARS}
          aria-label="Ask about this bill"
          placeholder="Ask a question about this bill"
        />
        <div className="bill-chat-prompt-footer">
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
            <Button
              type="submit"
              size="sm"
              variant="default"
              className="bill-chat-prompt-submit"
              disabled={input.trim().length === 0}
            >
              Send
            </Button>
          )}
        </div>
      </form>

      <SelectionMenu
        selection={selection}
        status={selectionStatus}
        busy={sharingAnswer}
        onShareQuote={(current) => {
          void shareAnswerSelection(current)
        }}
        onCopy={(current) => {
          void copyTextToClipboard(current.text).then((ok) =>
            setSelectionStatus(ok ? 'Copied' : "Couldn't copy"),
          )
        }}
      />
    </section>
  )
}
