import type { BillProcessSummary } from '@congress-tracker/shared/bill-process-api-types'

import type { BillLifecycleStage } from '../utils/billLifecycleStages'
import { formatVoteDate } from '../utils/billLabels'

type BillPipelineProps = {
  stages: BillLifecycleStage[]
  /** Optional callout under the stepper (e.g. unsigned-law explanation). */
  detail?: string | null
  /** Committee process steps nested under the Committee stage when present. */
  process?: BillProcessSummary | null
}

function stageDateLabel(date: string | null): string | null {
  if (!date) return null
  return formatVoteDate(date)
}

export function BillPipeline({ stages, detail, process = null }: BillPipelineProps) {
  if (stages.length === 0) return null

  const processSteps = process?.stages ?? []
  const showProcessSteps = processSteps.length > 0
  const committeeStatus =
    !showProcessSteps && process?.current_label ? process.current_label : null

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

      {showProcessSteps ? (
        <div className="bill-pipeline-committee" aria-label="Committee steps">
          {process?.current_label ? (
            <p className="bill-pipeline-committee-status">{process.current_label}</p>
          ) : null}
          <ol className="bill-pipeline-committee-steps">
            {processSteps.map((step, index) => {
              const dateLabel = step.date ? stageDateLabel(step.date) : null
              return (
                <li
                  key={`${step.system_code}-${step.activity_key}-${step.date ?? index}`}
                  className={`bill-pipeline-committee-step${
                    step.is_subcommittee ? ' bill-pipeline-committee-step--sub' : ''
                  }`}
                >
                  <span className="bill-pipeline-committee-marker" aria-hidden="true" />
                  <span className="bill-pipeline-committee-copy">
                    <span className="bill-pipeline-committee-label">{step.label}</span>
                    {dateLabel && step.date ? (
                      <time className="bill-pipeline-committee-date" dateTime={step.date}>
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

      {committeeStatus ? <p className="bill-pipeline-detail">{committeeStatus}</p> : null}
      {detail ? <p className="bill-pipeline-detail">{detail}</p> : null}
    </div>
  )
}
