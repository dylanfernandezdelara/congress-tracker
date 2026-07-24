import type { BillLifecycleStage } from '../utils/billLifecycleStages'
import { formatVoteDate } from '../utils/billLabels'

type BillPipelineProps = {
  stages: BillLifecycleStage[]
  /** Optional callout under the stepper (e.g. unsigned-law explanation). */
  detail?: string | null
}

function stageDateLabel(date: string | null): string | null {
  if (!date) return null
  return formatVoteDate(date)
}

export function BillPipeline({ stages, detail }: BillPipelineProps) {
  if (stages.length === 0) return null

  return (
    <div className="bill-pipeline">
      <ol className="bill-pipeline-steps" aria-label="Bill lifecycle">
        {stages.map((stage) => {
          const dateLabel = stageDateLabel(stage.date)
          return (
            <li
              key={stage.key}
              className={`bill-pipeline-step bill-pipeline-step--${stage.state}`}
            >
              <span className="bill-pipeline-connector" aria-hidden="true" />
              <span className="bill-pipeline-marker" aria-hidden="true" />
              <span className="bill-pipeline-copy">
                <span className="bill-pipeline-label">{stage.label}</span>
                {dateLabel && stage.date ? (
                  <time className="bill-pipeline-date" dateTime={stage.date}>
                    {dateLabel}
                  </time>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>
      {detail ? <p className="bill-pipeline-detail">{detail}</p> : null}
    </div>
  )
}
