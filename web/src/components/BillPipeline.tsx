import type { BillLifecycleStage } from '../utils/billLifecycleStages'
import type { BillJourneyEvent } from '../utils/billJourney'
import { journeyKindLabel } from '../utils/billJourney'
import { formatVoteDate } from '../utils/billLabels'

type BillPipelineProps = {
  stages: BillLifecycleStage[]
  /** Optional callout under the stepper (e.g. unsigned-law explanation). */
  detail?: string | null
  /** Committee/floor status line when hydrated. */
  statusLabel?: string | null
  /** Chronological committee + floor + vote path (not the 5-step map). */
  journey?: BillJourneyEvent[]
}

function stageDateLabel(date: string | null): string | null {
  if (!date) return null
  return formatVoteDate(date)
}

export function BillPipeline({
  stages,
  detail,
  statusLabel = null,
  journey = [],
}: BillPipelineProps) {
  if (stages.length === 0 && journey.length === 0) return null

  const processStatus = statusLabel?.trim() || null
  const showJourney = journey.length > 0

  return (
    <div className="bill-pipeline">
      {stages.length > 0 ? (
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
      ) : null}

      {showJourney ? (
        <div className="bill-pipeline-journey">
          {processStatus ? <p className="bill-pipeline-process-status">{processStatus}</p> : null}
          <ol className="bill-pipeline-journey-list" aria-label="Path through Congress">
            {journey.map((step) => {
              const dateLabel = step.date ? stageDateLabel(step.date) : null
              return (
                <li
                  key={step.id}
                  className={`bill-pipeline-journey-step bill-pipeline-journey-step--${step.state}`}
                >
                  <span className="bill-pipeline-journey-kind">{journeyKindLabel(step.kind)}</span>
                  <span className="bill-pipeline-journey-copy">
                    <span className="bill-pipeline-journey-label">{step.label}</span>
                    {dateLabel && step.date ? (
                      <time className="bill-pipeline-journey-date" dateTime={step.date}>
                        {dateLabel}
                      </time>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}

      {detail ? <p className="bill-pipeline-detail">{detail}</p> : null}
    </div>
  )
}
