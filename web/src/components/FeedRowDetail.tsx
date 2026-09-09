import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import type { BillQuote } from '@congress-tracker/shared/share-api-types'

import { createBillQuote } from '../api/client'
import type { FeedItem, FeedPrimarySponsor } from '../api/types'
import { copyTextToClipboard, formatBillQueryParam } from '../utils/billDeepLink'
import { fitPassageForQuote } from '../utils/billChat'
import { congressGovBillUrl } from '../utils/billLabels'
import { buildBillJourney } from '../utils/billJourney'
import { getBillLifecycleStages } from '../utils/billLifecycleStages'
import { getFeedSummaryContent, isProceduralFeedItem } from '../utils/feedRowLabels'
import { latestPassageVote } from '../utils/ogCardModel'
import { shareQuoteErrorCopy } from '../utils/shareQuoteCopy'
import { primarySponsorDisplay } from '../utils/sponsorLabels'
import { useBillShare } from '../hooks/useBillShare'
import { useRollDefectors, voteRollKey } from '../hooks/useRollDefectors'
import { useSharedQuoteLanding } from '../hooks/useSharedQuoteLanding'
import { useTextSelectionMenu, type TextSelection } from '../hooks/useTextSelectionMenu'
import { BillChatSection } from './BillChatSection'
import { BillPipeline } from './BillPipeline'
import { BillShareSheet } from './BillShareSheet'
import { BillTextChangesSection } from './BillTextChangesSection'
import { ShareIcon } from './ShareIcon'
import { FeedRowExecutiveQuote } from './FeedRowExecutiveQuote'
import { FeedSummarySections } from './FeedSummarySections'
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

const SELECTION_STATUS_MS = 1800
/** Bill-text regions this panel's selection menu handles; answer bubbles are the chat section's. */
const BILL_TEXT_SELECTION_SOURCES = ['digest', 'crs'] as const

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
  const [selectionStatus, setSelectionStatus] = useState<string | null>(null)
  const [sharingQuote, setSharingQuote] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [chatSelection, setChatSelection] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const sponsorDisplay = primarySponsorDisplay(item.primary_sponsor)

  const latestVote = latestPassageVote(item.passage_votes)
  const latestRollKey = latestVote ? voteRollKey(latestVote) : null
  const latestDefectors = latestRollKey ? defectorsByRoll.get(latestRollKey) : undefined
  const share = useBillShare(item, {
    shareUrl,
    partySplits: latestDefectors?.status === 'ready' ? latestDefectors.partySplits : [],
  })
  const { selection, clear: clearSelection } = useTextSelectionMenu(detailRef, {
    enabled: !share.open,
    sources: BILL_TEXT_SELECTION_SOURCES,
  })
  const landing = useSharedQuoteLanding({
    item,
    quoteId,
    summary,
    containerRef: detailRef,
    notify: setToast,
  })

  useEffect(() => {
    if (!selectionStatus) return
    const timer = window.setTimeout(() => setSelectionStatus(null), SELECTION_STATUS_MS)
    return () => window.clearTimeout(timer)
  }, [selectionStatus])

  const dismissToast = useCallback(() => setToast(null), [])

  const handleShareQuote = async (current: TextSelection) => {
    setSharingQuote(true)
    try {
      const { quote } = await createBillQuote({
        bill: formatBillQueryParam(item.bill),
        text: current.text,
      })
      clearSelection()
      share.openSheet(quote)
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
        text: fitPassageForQuote(text),
      })
      share.openSheet(quote)
    } catch (error) {
      setToast(shareQuoteErrorCopy(error))
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
          onClick={() => share.openSheet(null)}
          aria-label="Share"
          title="Share"
        >
          <ShareIcon />
        </button>
      </div>

      {landing.quote && !landing.inSummary ? <SharedQuoteCallout quote={landing.quote} /> : null}

      <FeedSummarySections content={summary} highlight={landing.highlight} />

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
        item={item}
        pendingSelection={chatSelection}
        onClearSelection={() => setChatSelection(null)}
        onSharePassage={(text) => {
          void handleSharePassage(text)
        }}
        onQuoteCreated={share.openSheet}
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
        open={share.open}
        selectionKey={share.selectionKey}
        payload={share.payload}
        card={share.card}
        copied={share.copied}
        onClose={share.closeSheet}
        onShare={() => {
          void share.share()
        }}
        onCopy={() => {
          void share.copyLink()
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
