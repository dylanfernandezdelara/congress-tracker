import type { FeedItem } from '../api/types'
import { congressGovBillUrl } from '../utils/billLabels'
import { getBillLifecycleStages } from '../utils/billLifecycleStages'
import { isProceduralFeedItem } from '../utils/feedRowLabels'
import { policyAreaChipClass, policyAreaChipStyle } from '../utils/policyAreaChip'
import { useRollDefectors } from '../hooks/useRollDefectors'
import { BillPipeline } from './BillPipeline'
import { FeedRowExecutiveQuote } from './FeedRowExecutiveQuote'
import { PassageVoteDetails } from './PassageVoteDetails'

type FeedRowDetailProps = {
  item: FeedItem
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
      <p className="feed-row-executive-disclaimer text-sm text-faint">
        Informal presidential statement — not recorded on Congress.gov.
      </p>
    </section>
  )
}

export function FeedRowDetail({ item }: FeedRowDetailProps) {
  const sourceUrl = congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number)
  const isProcedural = isProceduralFeedItem(item)
  const { stages, terminalStatus } = getBillLifecycleStages(item)
  const pipelineDetail =
    terminalStatus === 'became_law_unsigned' || terminalStatus === 'pending_signature'
      ? (stages.find((stage) => stage.key === 'outcome')?.detail ?? null)
      : null
  const defectorsByRoll = useRollDefectors(item.passage_votes)

  return (
    <div className="feed-row-detail">
      <BillPipeline stages={stages} detail={pipelineDetail} />

      {isProcedural ? (
        <div className="feed-row-detail-chips flex flex-wrap gap-2">
          <span
            className={policyAreaChipClass('Procedural')}
            style={policyAreaChipStyle('Procedural')}
          >
            Procedural
          </span>
        </div>
      ) : null}

      <ExecutiveContextSection item={item} />

      <section className="feed-row-detail-section">
        <h3 className="feed-row-detail-heading">Vote history</h3>
        <PassageVoteDetails votes={item.passage_votes} defectorsByRoll={defectorsByRoll} />
      </section>

      <footer className="feed-row-detail-footer">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="congress-link text-sm"
        >
          Read on congress.gov ↗
        </a>
      </footer>
    </div>
  )
}
