import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'
import { BILL_CHAT_MAX_QUESTION_CHARS } from '@congress-tracker/shared/chat-api-types'
import type { BillQuote } from '@congress-tracker/shared/share-api-types'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { FileTextIcon, XIcon } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'

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
import { formatShortBillId } from '../utils/billLabels'
import { copyTextToClipboard } from '../utils/billDeepLink'
import { shareQuoteErrorCopy } from '../utils/shareQuoteCopy'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
} from './ai-elements/prompt-input'
import { Suggestion } from './ai-elements/suggestion'
import { BillChatTranscript, messageAnswer, type BillChatMessage } from './BillChatTranscript'
import { SelectionMenu } from './SelectionMenu'
import { Badge } from './ui/badge'
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
  const billLabel = formatShortBillId(item.bill.type, item.bill.number)
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

  // While a reply is in flight the footer shows Stop (type=button), so
  // PromptInputTextarea's Enter handler finds no disabled submit button and
  // `requestSubmit()`s; PromptInput then `form.reset()`s the textarea before
  // `submitQuestion` bails on `streaming`. A draft only survives that reset
  // because React mirrors a controlled textarea's value into `defaultValue`.
  // Swallow Enter here instead of leaning on that; Shift+Enter still inserts
  // a newline and an IME candidate confirm (`isComposing`, or keyCode 229 on
  // engines that report the confirm after composition ended) is left alone.
  const holdEnterWhileStreaming = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!streaming || event.key !== 'Enter' || event.shiftKey) return
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
    event.preventDefault()
    event.stopPropagation()
  }

  // The composer is text-only. The registry textarea cancels any paste that
  // carries a file item (screenshots, rich clipboards from office suites) to
  // attach it, which drops the clipboard text; stopping the event here lets
  // the browser's default paste insert that text instead.
  const keepPasteAsText = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = event.clipboardData?.items
    if (items && Array.from(items).some((item) => item.kind === 'file')) event.stopPropagation()
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
    <section
      ref={sectionRef}
      className="feed-row-detail-section bill-chat"
      aria-labelledby="bill-chat-heading"
    >
      <h3 id="bill-chat-heading" className="feed-row-detail-heading">
        Ask about this bill
      </h3>

      <div className="bill-chat-body">
        <BillChatTranscript
          messages={messages}
          status={status}
          onSharePassage={onSharePassage}
          billLabel={billLabel}
        />

        {messages.length === 0 ? (
          // Registry `Suggestions` is a one-row horizontal scroller with a
          // hidden scrollbar; in the detail panel's column the chips wrap
          // instead so none are hidden behind a swipe.
          <div className="flex flex-wrap gap-2">
            {starters.map((chip) => (
              <Suggestion key={chip} suggestion={chip} onClick={submitQuestion} />
            ))}
          </div>
        ) : null}

        {errorText ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
          >
            <span className="min-w-0 flex-1">{errorText}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => void regenerate()}
            >
              Retry
            </Button>
          </div>
        ) : null}

        <PromptInput className="bill-chat-prompt" onSubmit={({ text }) => submitQuestion(text)}>
          {attachedSelection ? (
            <PromptInputHeader>
              <Badge
                variant="secondary"
                className="bill-chat-attachment max-w-full gap-1.5 py-1 font-medium"
                title={attachedSelection}
              >
                <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="bill-chat-attachment-label min-w-0 truncate">
                  {selectionChipLabel(attachedSelection)}
                </span>
                {onClearSelection ? (
                  <button
                    type="button"
                    className="inline-flex shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="Remove"
                    onClick={onClearSelection}
                  >
                    <XIcon className="size-3" />
                  </button>
                ) : null}
              </Badge>
            </PromptInputHeader>
          ) : null}
          <PromptInputBody onKeyDownCapture={holdEnterWhileStreaming} onPasteCapture={keepPasteAsText}>
            <PromptInputTextarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, BILL_CHAT_MAX_QUESTION_CHARS))}
              maxLength={BILL_CHAT_MAX_QUESTION_CHARS}
              aria-label="Ask about this bill"
              placeholder="Ask a question about this bill"
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-end">
            {streaming ? (
              <PromptInputSubmit type="button" status={status} aria-label="Stop" onClick={() => stop()} />
            ) : (
              <PromptInputSubmit status="ready" aria-label="Send" disabled={input.trim().length === 0} />
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>

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
