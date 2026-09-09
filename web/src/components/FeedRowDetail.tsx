import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import type { BillQuote } from '@congress-tracker/shared/share-api-types'

import { ApiError } from '../api/fetchJson'
import { createBillQuote } from '../api/client'
import type { FeedItem, FeedPrimarySponsor } from '../api/types'
import {
  buildBillQuoteSharePayload,
  buildBillSharePayload,
  copyTextToClipboard,
  formatBillQueryParam,
  shareBillViaNavigator,
} from '../utils/billDeepLink'
import { congressGovBillUrl } from '../utils/billLabels'
import { buildBillJourney } from '../utils/billJourney'
import { getBillLifecycleStages } from '../utils/billLifecycleStages'
import { getFeedSummaryContent, isProceduralFeedItem } from '../utils/feedRowLabels'
import { buildOgCardModelFromFeedItem, latestPassageVote } from '../utils/ogCardModel'
import { primarySponsorDisplay } from '../utils/sponsorLabels'
import { useRollDefectors, voteRollKey } from '../hooks/useRollDefectors'
import { useSharedQuote } from '../hooks/useSharedQuote'
import { useTextSelectionMenu, type TextSelection } from '../hooks/useTextSelectionMenu'
import { BillChatSection, type BillChatSectionHandle } from './BillChatSection'
import { BillPipeline } from './BillPipeline'
import { BillShareSheet } from './BillShareSheet'
import { BillTextChangesSection } from './BillTextChangesSection'
import { ShareIcon } from './ShareIcon'
import { FeedRowExecutiveQuote } from './FeedRowExecutiveQuote'
import { FeedSummarySections, summaryContainsQuote } from './FeedSummarySections'
import { MemberProfileTrigger } from './MemberProfileTrigger'
import { PassageVoteDetails } from './PassageVoteDetails'
import { SelectionMenu } from './SelectionMenu'
import { Toast } from './Toast'

type FeedRowDetailProps = {
  item: FeedItem
  /** Override for the share URL; defaults to the timeline deep link. */
  shareUrl?: string
  /** `?quote=` id from a shared link that targets this bill. */
  quoteId?: string | null
}

const SHARED_QUOTE_TOAST = 'Shared quote'
const SELECTION_STATUS_MS = 1800

function shareQuoteErrorCopy(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'quote_too_short':
      case 'quote_too_long':
      case 'quote_not_in_bill':
      case 'rate_limited':
        return error.message
      default:
        break
    }
  }
  return "Couldn't create a quote link. Try again."
}

function SharedQuoteCallout({ quote }: { quote: BillQuote }) {
  return (
    <aside className="shared-quote-callout" aria-label="Shared quote">
      <p className="shared-quote-callout-label">Shared quote</p>
      <p className="shared-quote-callout-text">“{quote.text}”</p>
      <p className="shared-quote-callout-note">
        This passage is no longer in the summary shown below.
      </p>
    </aside>
  )
}

function SponsorLine({ sponsor }: { sponsor: FeedPrimarySponsor }) {
  const display = primarySponsorDisplay(sponsor)
  if (!display) return null

  const nameEl: ReactNode = display.name ? (
    <MemberProfileTrigger
      seed={{
        bioguide_id: sponsor.bioguide_id,
        name: display.name,
        party: sponsor.party ?? '',
        state: sponsor.state,
      }}
      className="feed-row-sponsor-name"
    >
      {display.name}
    </MemberProfileTrigger>
  ) : null
  const metaEl = display.meta ? (
    <>
      {nameEl ? ' · ' : null}
      {display.meta}
    </>
  ) : null

  return (
    <>
      {nameEl}
      {metaEl}
    </>
  )
}

function ExecutiveContextSection({ item }: { item: FeedItem }) {
  const signals = item.executive_signals ?? []
  const related = item.related_executive_bills ?? []
  if (signals.length === 0) return null

  return (
    <section className="feed-row-detail-section feed-row-detail-section--executive">
      <h3 className="feed-row-detail-heading">Executive context</h3>
      <ul className="feed-row-executive-list">
        {signals.map((signal, index) => (
          <li key={signal.post_id} className="feed-row-executive-item">
            <FeedRowExecutiveQuote
              signal={signal}
              bill={item.bill}
              billHeadline={item.digest?.headline ?? null}
              relatedBills={index === 0 ? related : []}
            />
          </li>
        ))}
      </ul>
      <p className="feed-row-executive-disclaimer text-[13px] text-faint">
        Informal presidential statement — not recorded on Congress.gov.
      </p>
    </section>
  )
}

export function FeedRowDetail({ item, shareUrl, quoteId = null }: FeedRowDetailProps) {
  const sourceUrl = congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number)
  const isProcedural = isProceduralFeedItem(item)
  const summary = getFeedSummaryContent(item)
  const { stages, terminalStatus } = getBillLifecycleStages(item)
  const pipelineDetail =
    terminalStatus === 'became_law_unsigned' || terminalStatus === 'pending_signature'
      ? (stages.find((stage) => stage.key === 'outcome')?.detail ?? null)
      : null
  const defectorsByRoll = useRollDefectors(item.passage_votes)
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareKey, setShareKey] = useState(0)
  /** Quote being shared from the sheet; null shares the whole bill. */
  const [pendingQuote, setPendingQuote] = useState<BillQuote | null>(null)
  const [sharingQuote, setSharingQuote] = useState(false)
  const [selectionStatus, setSelectionStatus] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [chatSelection, setChatSelection] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const chatRef = useRef<BillChatSectionHandle>(null)
  const { selection, clear: clearSelection } = useTextSelectionMenu(detailRef, {
    enabled: !shareOpen,
  })
  const sharedQuote = useSharedQuote(item, quoteId)
  const sponsorDisplay = primarySponsorDisplay(item.primary_sponsor)

  const sharePayload = pendingQuote
    ? buildBillQuoteSharePayload(item, pendingQuote)
    : buildBillSharePayload(item, shareUrl)
  const latestVote = latestPassageVote(item.passage_votes)
  const latestRollKey = latestVote ? voteRollKey(latestVote) : null
  const latestDefectors = latestRollKey ? defectorsByRoll.get(latestRollKey) : undefined
  const shareCard = buildOgCardModelFromFeedItem(item, {
    quote: pendingQuote?.text ?? null,
    partySplits: latestDefectors?.status === 'ready' ? latestDefectors.partySplits : [],
  })

  const landedQuote = sharedQuote.status === 'ready' ? sharedQuote.quote : null
  const landedQuoteInSummary = landedQuote ? summaryContainsQuote(summary, landedQuote.text) : false
  const summaryHighlight = landedQuote && landedQuoteInSummary ? { quote: landedQuote.text, landing: true } : null

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!selectionStatus) return
    const timer = window.setTimeout(() => setSelectionStatus(null), SELECTION_STATUS_MS)
    return () => window.clearTimeout(timer)
  }, [selectionStatus])

  // G2 landing: once the shared quote resolves, bring the highlight into view and confirm.
  useEffect(() => {
    if (!landedQuote) return
    setToast(SHARED_QUOTE_TOAST)
    if (!landedQuoteInSummary) return
    const frame = window.requestAnimationFrame(() => {
      const mark = detailRef.current?.querySelector<HTMLElement>('[data-quote-highlight]')
      mark?.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [landedQuote, landedQuoteInSummary])

  const dismissToast = useCallback(() => setToast(null), [])

  const handleCopyLink = async () => {
    const ok = await copyTextToClipboard(sharePayload.clipboardText)
    if (ok) setCopied(true)
  }

  const handleShare = async () => {
    const result = await shareBillViaNavigator(sharePayload)
    if (result === 'unavailable') {
      await handleCopyLink()
    }
  }

  const openShareSheet = (quote: BillQuote | null) => {
    setPendingQuote(quote)
    setShareKey((key) => key + 1)
    setShareOpen(true)
  }

  const handleShareQuote = async (current: TextSelection) => {
    setSharingQuote(true)
    try {
      const bill = formatBillQueryParam(item.bill)
      if (current.source === 'answer') {
        const answer = current.sourceId ? chatRef.current?.getAnswer(current.sourceId) : undefined
        if (!answer?.sig) {
          setSelectionStatus('Sharing chat answers is unavailable')
          return
        }
        const { quote } = await createBillQuote({
          bill,
          text: current.text,
          answer: { text: answer.text, sig: answer.sig },
        })
        clearSelection()
        openShareSheet(quote)
        return
      }
      const { quote } = await createBillQuote({
        bill,
        text: current.text,
      })
      clearSelection()
      openShareSheet(quote)
    } catch (error) {
      setSelectionStatus(shareQuoteErrorCopy(error))
    } finally {
      setSharingQuote(false)
    }
  }

  const handleSharePassage = async (text: string) => {
    try {
      const { quote } = await createBillQuote({
        bill: formatBillQueryParam(item.bill),
        text,
      })
      openShareSheet(quote)
    } catch (error) {
      setToast(error instanceof ApiError ? error.message : shareQuoteErrorCopy(error))
    }
  }

  const handleCopySelection = async (current: TextSelection) => {
    const ok = await copyTextToClipboard(current.text)
    setSelectionStatus(ok ? 'Copied' : "Couldn't copy")
  }

  return (
    <div className="feed-row-detail" ref={detailRef}>
      <div className="feed-row-detail-topbar">
        {sponsorDisplay && item.primary_sponsor ? (
          <p className="feed-row-sponsor">
            <span className="feed-row-sponsor-label">Sponsored by</span>{' '}
            <SponsorLine sponsor={item.primary_sponsor} />
          </p>
        ) : null}
        <button
          type="button"
          className="feed-row-share"
          onClick={() => openShareSheet(null)}
          aria-label="Share"
          title="Share"
        >
          <ShareIcon />
        </button>
      </div>

      {landedQuote && !landedQuoteInSummary ? <SharedQuoteCallout quote={landedQuote} /> : null}

      <FeedSummarySections content={summary} highlight={summaryHighlight} />

      {item.text_changes ? <BillTextChangesSection changes={item.text_changes} /> : null}

      <BillPipeline
        stages={stages}
        detail={pipelineDetail}
        statusLabel={item.process?.current_label}
        journey={buildBillJourney(item)}
      />

      {isProcedural ? (
        <div className="feed-row-detail-chips">
          <span data-feed-policy-area className="feed-row-policy-area">
            Procedural
          </span>
        </div>
      ) : null}

      <ExecutiveContextSection item={item} />

      <section className="feed-row-detail-section">
        <h3 className="feed-row-detail-heading">Vote history</h3>
        <PassageVoteDetails
          votes={item.passage_votes}
          defectorsByRoll={defectorsByRoll}
          companionVotes={item.companion_votes ?? []}
        />
      </section>

      <BillChatSection
        ref={chatRef}
        item={item}
        pendingSelection={chatSelection}
        onClearSelection={() => setChatSelection(null)}
        onSharePassage={(text) => {
          void handleSharePassage(text)
        }}
      />

      <footer className="feed-row-detail-footer">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="congress-link"
        >
          Read on congress.gov ↗
        </a>
      </footer>

      <BillShareSheet
        open={shareOpen}
        selectionKey={shareKey}
        payload={sharePayload}
        card={shareCard}
        copied={copied}
        onClose={() => setShareOpen(false)}
        onShare={() => {
          void handleShare()
        }}
        onCopy={() => {
          void handleCopyLink()
        }}
      />

      <SelectionMenu
        selection={selection}
        status={selectionStatus}
        busy={sharingQuote}
        onShareQuote={(current) => {
          void handleShareQuote(current)
        }}
        onAsk={(sel) => {
          setChatSelection(sel.text)
          clearSelection()
        }}
        onCopy={(current) => {
          void handleCopySelection(current)
        }}
      />

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  )
}
