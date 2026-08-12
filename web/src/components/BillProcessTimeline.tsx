import type { BillProcessSummary } from '@congress-tracker/shared/bill-process-api-types'

import { formatVoteDate } from '../utils/billLabels'

type BillProcessTimelineProps = {
  process: BillProcessSummary
}

export function BillProcessTimeline({ process }: BillProcessTimelineProps) {
  if (process.stages.length === 0 && !process.current_label) return null

  return (
    <section className="bill-process" aria-label="Committee process">
      <h3 className="feed-row-detail-heading">Committee process</h3>
      {process.current_label ? (
        <p className="bill-process-current">{process.current_label}</p>
      ) : null}
      {process.stages.length > 0 ? (
        <ol className="bill-process-steps">
          {process.stages.map((stage, index) => {
            const dateLabel = stage.date ? formatVoteDate(stage.date) : null
            return (
              <li
                key={`${stage.system_code}-${stage.activity_key}-${stage.date ?? index}`}
                className={`bill-process-step${stage.is_subcommittee ? ' bill-process-step--sub' : ''}`}
              >
                <span className="bill-process-marker" aria-hidden="true" />
                <span className="bill-process-copy">
                  <span className="bill-process-label">{stage.label}</span>
                  {dateLabel && stage.date ? (
                    <time className="bill-process-date" dateTime={stage.date}>
                      {dateLabel}
                    </time>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
      ) : null}
    </section>
  )
}
