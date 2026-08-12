import type { BillProcessSummary } from '@congress-tracker/shared/bill-process-api-types'

import type { BillLifecycleStage } from '../utils/billLifecycleStages'
import { formatVoteDate } from '../utils/billLabels'

type BillPipelineProps = {
  stages: BillLifecycleStage[]
  /** Optional callout under the stepper (e.g. unsigned-law explanation). */
  detail?: string | null
  /** Committee history shown as a step list under the existing diagram. */
  process?: BillProcessSummary | null
}

function stageDateLabel(date: string | null): string | null {
  if (!date) return null
  return formatVoteDate(date)
}

export function BillPipeline({ stages, detail, process = null }: BillPipelineProps) {
  if (stages.length === 0) return null

  const processSteps = process?.stages ?? []
  const processStatus = process?.current_label?.trim() || null
  const showProcess = Boolean(processStatus || processSteps.length > 0)

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

      {showProcess ? (
        <div className="bill-pipeline-process" aria-label="Committee steps">
          {processStatus ? <p className="bill-pipeline-process-status">{processStatus}</p> : null}
          {processSteps.length > 0 ? (
            <ol className="bill-pipeline-process-steps">
              {processSteps.map((step, index) => {
                const dateLabel = step.date ? stageDateLabel(step.date) : null
                return (
                  <li
                    key={`${step.system_code}-${step.activity_key}-${step.date ?? index}`}
                    className="bill-pipeline-process-step"
                  >
                    <span>{step.label}</span>
                    {dateLabel && step.date ? (
                      <time dateTime={step.date}>{dateLabel}</time>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          ) : null}
        </div>
      ) : null}

      {detail ? <p className="bill-pipeline-detail">{detail}</p> : null}
    </div>
  )
}
