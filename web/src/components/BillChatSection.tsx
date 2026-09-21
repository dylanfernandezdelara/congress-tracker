import { formatBillQueryParam } from '@congress-tracker/shared/bill-id'
import { BILL_CHAT_MAX_QUESTION_CHARS } from '@congress-tracker/shared/chat-api-types'
import type { BillQuote } from '@congress-tracker/shared/share-api-types'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { FileTextIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { StickToBottomContext } from 'use-stick-to-bottom'

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
import { billChatInstance } from '../utils/billChatInstance'
import { buildBillChatExportPrompt } from '../utils/billChatExport'
import { congressGovBillUrl, formatShortBillId, getBillColloquialName } from '../utils/billLabels'
import { buildBillShareUrl, copyTextToClipboard } from '../utils/billDeepLink'
import { shareQuoteErrorCopy } from '../utils/shareQuoteCopy'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from './ai-elements/prompt-input'
import { Suggestion, Suggestions } from './ai-elements/suggestion'
import { BillChatExportMenu } from './BillChatExportMenu'
import { BillChatTranscript, messageAnswer, messagePlainText, type BillChatMessage } from './BillChatTranscript'
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
  /** Peek bar: hide the transcript and composer so the handle stays a title row. */
  collapsed?: boolean
  /** Drawer Open chat / Minimize (or other chrome) on the title row. */
  headerActions?: ReactNode
}

export function BillChatSection({
  item,
  pendingSelection = null,
  onClearSelection,
  onSharePassage,
  onQuoteCreated,
  collapsed = false,
  headerActions,
}: BillChatSectionProps) {
  const billId = formatBillQueryParam(item.bill)
  const billLabel = formatShortBillId(item.bill.type, item.bill.number)
  const sectionRef = useRef<HTMLElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const conversationRef = useRef<StickToBottomContext>(null)
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
  const chat = useMemo(() => billChatInstance(billId, transport), [billId, transport])
  const { messages, sendMessage, status, stop, error, regenerate } = useChat<BillChatMessage>({
    chat,
  })
  const { selection, clear: clearSelection } = useTextSelectionMenu(sectionRef, {
    sources: ANSWER_SELECTION_SOURCES,
  })

  useEffect(() => {
    if (!pendingSelection || collapsed) return
    textareaRef.current?.focus()
  }, [collapsed, pendingSelection])

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
  const exportPrompt = useMemo(() => {
    const turns = messages.flatMap((message) => {
      if (message.role !== 'user' && message.role !== 'assistant') return []
      const text = messagePlainText(message)
      return text ? [{ role: message.role, text }] : []
    })
    return buildBillChatExportPrompt({
      billLabel: getBillColloquialName({ ...item.bill, headline: item.digest?.headline }),
      billId: billLabel,
      sourceUrl: congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number),
      pageUrl: buildBillShareUrl(item),
      headline: item.digest?.headline,
      whatItDoes: item.digest?.what_it_does,
      keyPoints: item.digest?.key_points,
      crsSummary: item.raw_summary_text,
      messages: turns,
    })
  }, [billLabel, item, messages])

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
      // A reader scrolled up in the log has escaped StickToBottom's lock; a
      // new question re-engages it so the answer streams into view.
      void conversationRef.current?.scrollToBottom()
    },
    [attachedSelection, onClearSelection, sendMessage, streaming],
  )

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
      className={`bill-chat${collapsed ? ' bill-chat--collapsed' : ''}`}
      aria-labelledby="bill-chat-heading"
    >
      <header className="bill-chat-header">
        <h3 id="bill-chat-heading" className="feed-row-detail-heading">
          Ask about this bill
        </h3>
        {headerActions ? <div className="bill-chat-header-actions">{headerActions}</div> : null}
      </header>

      {collapsed ? null : (
        <div className="bill-chat-body">
          <BillChatTranscript
            messages={messages}
            status={status}
            onSharePassage={onSharePassage}
            billLabel={billLabel}
            conversationRef={conversationRef}
          />

          {messages.length === 0 ? (
            <Suggestions className="w-full flex-wrap">
              {starters.map((chip) => (
                <Suggestion key={chip} suggestion={chip} disabled={streaming} onClick={submitQuestion} />
              ))}
            </Suggestions>
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
            <PromptInputBody>
              <PromptInputTextarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, BILL_CHAT_MAX_QUESTION_CHARS))}
                maxLength={BILL_CHAT_MAX_QUESTION_CHARS}
                aria-label="Ask about this bill"
                placeholder="Ask a question about this bill"
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <BillChatExportMenu query={exportPrompt} />
              </PromptInputTools>
              {streaming ? (
                <PromptInputSubmit type="button" status={status} aria-label="Stop" onClick={() => stop()} />
              ) : (
                <PromptInputSubmit status="ready" aria-label="Send" disabled={input.trim().length === 0} />
              )}
            </PromptInputFooter>
          </PromptInput>
        </div>
      )}

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
