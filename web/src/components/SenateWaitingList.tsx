import { formatBillQueryParam } from '../utils/billDeepLink'
import { formatDaysSinceHousePassage, formatShortBillId, formatVoteDate } from '../utils/billLabels'
import type { SenateWaitingBill } from '../api/types'
import { trimDisplayTitle } from '@congress-tracker/shared/feed-content'

type SenateWaitingListProps = {
  items: SenateWaitingBill[]
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  onOpenBill?: (billParam: string) => void
  compact?: boolean
}

export function SenateWaitingList({
  items,
  loading = false,
  error = null,
  onRetry,
  onOpenBill,
  compact = false,
}: SenateWaitingListProps) {
  return (
    <section
      className={`senate-waiting${compact ? ' senate-waiting--compact' : ''}`}
      aria-label="House-passed, sitting in the Senate"
    >
      <h2 className="sidebar-section-title">House-passed, sitting in the Senate</h2>
      {loading ? <p className="text-xs text-faint">Loading Senate-waiting bills…</p> : null}
      {error ? (
        <div className="space-y-2">
          <p className="text-xs text-fail">{error}</p>
          {onRetry ? (
            <button type="button" className="ghost-button text-xs" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {!error && items.length === 0 && !loading ? (
        <p className="text-xs text-faint">No House-passed bills are waiting in a Senate committee.</p>
      ) : !error ? (
        <ul className="senate-waiting-list">
          {items.map((item) => {
            const billId = formatShortBillId(item.bill_type, item.bill_number)
            const title = trimDisplayTitle(item.headline || item.title || billId)
            const billParam = formatBillQueryParam({
              congress: item.congress,
              type: item.bill_type,
              number: item.bill_number,
            })
            return (
              <li key={`${item.congress}-${item.bill_type}-${item.bill_number}`}>
                <button
                  type="button"
                  className="senate-waiting-item"
                  onClick={() => onOpenBill?.(billParam)}
                >
                  <span className="senate-waiting-bill">{billId}</span>
                  <span className="senate-waiting-title">{title}</span>
                  <span className="senate-waiting-meta">
                    {item.senate_committee ?? item.current_label ?? 'Senate committee'}
                    {item.house_passage_date
                      ? ` · ${formatDaysSinceHousePassage(item.house_passage_date) ?? `House ${formatVoteDate(item.house_passage_date)}`}`
                      : ''}
                    {item.text_grew ? ' · Text grew' : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
