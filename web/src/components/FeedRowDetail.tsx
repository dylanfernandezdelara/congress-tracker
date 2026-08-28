import { useEffect, useState } from 'react'

import type { FeedItem } from '../api/types'
import { buildBillShareUrl, copyTextToClipboard } from '../utils/billDeepLink'
import { congressGovBillUrl } from '../utils/billLabels'
import { buildBillJourney } from '../utils/billJourney'
import { getBillLifecycleStages } from '../utils/billLifecycleStages'
import { getFeedSummaryContent, isProceduralFeedItem } from '../utils/feedRowLabels'
import { useRollDefectors } from '../hooks/useRollDefectors'
import { BillPipeline } from './BillPipeline'
import { BillTextChangesSection } from './BillTextChangesSection'
import { FeedRowExecutiveQuote } from './FeedRowExecutiveQuote'
import { FeedSummarySections } from './FeedSummarySections'
import { PassageVoteDetails } from './PassageVoteDetails'

type FeedRowDetailProps = {
  item: FeedItem
  /** Override for the footer "Copy link" target; defaults to the timeline deep link. */
  shareUrl?: string
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

export function FeedRowDetail({ item, shareUrl }: FeedRowDetailProps) {
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

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const handleCopyLink = async () => {
    const ok = await copyTextToClipboard(shareUrl ?? buildBillShareUrl(item))
    if (ok) setCopied(true)
  }

  return (
    <div className="feed-row-detail">
      <FeedSummarySections content={summary} />

      {item.text_changes ? <BillTextChangesSection changes={item.text_changes} /> : null}

      <BillPipeline
        stages={stages}
        detail={pipelineDetail}
        process={item.process}
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

      <footer className="feed-row-detail-footer">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="congress-link"
        >
          Read on congress.gov ↗
        </a>
        <button
          type="button"
          className="feed-row-copy-link"
          onClick={() => {
            void handleCopyLink()
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </footer>
    </div>
  )
}
