import type { BillTextChanges } from '../api/types'
import {
  billTextChangesExplanation,
  formatProvisionLabel,
} from '../utils/billTextVersions'

/**
 * Flags provisions that exist in the newest bill text but not in the version our
 * plain-English summary describes. Congressional summaries are written before
 * floor amendments land, so without this a bill can pass carrying whole sections
 * the feed never mentions.
 */
export function BillTextChangesSection({ changes }: { changes: BillTextChanges }) {
  if (changes.added_provisions.length === 0) return null

  return (
    <section
      className="feed-row-detail-section feed-row-added-provisions"
      data-feed-added-provisions
    >
      <h3 className="feed-row-detail-heading">Added after this summary</h3>
      <p className="feed-row-added-provisions-lede">{billTextChangesExplanation(changes)}</p>
      <ul className="feed-row-added-provisions-list">
        {changes.added_provisions.map((provision) => (
          <li key={`${provision.label}-${provision.heading}`}>
            <span className="feed-row-added-provisions-label">
              {formatProvisionLabel(provision.label)}
            </span>{' '}
            {provision.heading}
          </li>
        ))}
      </ul>
      {changes.more_added_count > 0 ? (
        <p className="feed-row-added-provisions-more">
          + {changes.more_added_count} more added section
          {changes.more_added_count === 1 ? '' : 's'}
        </p>
      ) : null}
    </section>
  )
}
