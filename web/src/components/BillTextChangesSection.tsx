import { useState } from 'react'

import { TEXT_CHANGES_MAX_LISTED_PROVISIONS } from '@congress-tracker/shared/bill-text-constants'

import type { BillTextChanges } from '../api/types'
import {
  billTextChangesExplanation,
  dedupeQuotedProvisions,
  formatProvisionLabel,
  textLargelyReplaced,
} from '../utils/billTextVersions'

/**
 * Flags provisions that exist in the newest bill text but not in the version our
 * plain-English summary describes. Congressional summaries are written before
 * floor amendments land, so without this a bill can pass carrying whole sections
 * the feed never mentions.
 */
export function BillTextChangesSection({ changes }: { changes: BillTextChanges }) {
  const [expanded, setExpanded] = useState(false)

  if (changes.added_provisions.length === 0) return null

  const provisions = dedupeQuotedProvisions(changes.added_provisions)
  const replaced = textLargelyReplaced(changes)
  const collapsible = provisions.length > TEXT_CHANGES_MAX_LISTED_PROVISIONS
  const visible =
    collapsible && !expanded ? provisions.slice(0, TEXT_CHANGES_MAX_LISTED_PROVISIONS) : provisions
  // Unshown stored rows plus payload overflow — the true remaining total.
  const remainingNotShown = provisions.length - visible.length + changes.more_added_count
  const showOverflow = (!collapsible || expanded) && changes.more_added_count > 0

  return (
    <section
      className="feed-row-detail-section feed-row-added-provisions"
      data-feed-added-provisions
    >
      <h3 className="feed-row-detail-heading">
        {replaced ? 'The text changed after this summary' : 'Added after this summary'}
      </h3>
      {replaced ? (
        <p className="feed-row-added-provisions-warning">
          The newest version adds {provisions.length + changes.more_added_count} sections, so the summary above may not describe what
          was voted on.
        </p>
      ) : null}
      <p className="feed-row-added-provisions-lede">{billTextChangesExplanation(changes)}</p>
      <ul className="feed-row-added-provisions-list">
        {visible.map((provision) => (
          <li key={`${provision.label}-${provision.heading}`}>
            <span className="feed-row-added-provisions-label">
              {formatProvisionLabel(provision.label)}
            </span>{' '}
            {provision.heading}
          </li>
        ))}
      </ul>
      {collapsible ? (
        <button
          type="button"
          className="feed-row-added-provisions-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Show fewer' : `Show all ${provisions.length}`}
        </button>
      ) : null}
      {collapsible && !expanded && remainingNotShown > 0 ? (
        <span className="sr-only">{remainingNotShown} more not shown</span>
      ) : null}
      {showOverflow ? (
        <p className="feed-row-added-provisions-more">
          + {changes.more_added_count} more added section
          {changes.more_added_count === 1 ? '' : 's'}
        </p>
      ) : null}
    </section>
  )
}
