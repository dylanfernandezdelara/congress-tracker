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

  const committee = stages.find((stage) => stage.key === 'committee')
  const substeps = committee?.substeps ?? []
  const showSubsteps = substeps.length > 0
  const committeeStatus =
    !showSubsteps && committee?.statusLabel ? committee.statusLabel : null

  return (
    <div className="bill-pipeline">
      <ol className="bill-pipeline-steps" aria-label="Bill lifecycle">
        {stages.map((stage) => {
          const dateLabel = stageDateLabel(stage.date)
          const isCommittee = stage.key === 'committee'
          return (
            <li
              key={stage.key}
              className={`bill-pipeline-step bill-pipeline-step--${stage.state}${
                isCommittee && showSubsteps ? ' bill-pipeline-step--has-substeps' : ''
              }`}
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
              {isCommittee && showSubsteps ? (
                <div className="bill-pipeline-committee" aria-label="Committee steps">
                  {stage.statusLabel ? (
                    <p className="bill-pipeline-committee-status">{stage.statusLabel}</p>
                  ) : null}
                  <ol className="bill-pipeline-committee-steps">
                    {substeps.map((step) => {
                      const stepDateLabel = step.date ? stageDateLabel(step.date) : null
                      return (
                        <li
                          key={step.key}
                          className={`bill-pipeline-committee-step${
                            step.isSubcommittee ? ' bill-pipeline-committee-step--sub' : ''
                          }`}
                        >
                          <span className="bill-pipeline-committee-marker" aria-hidden="true" />
                          <span className="bill-pipeline-committee-copy">
                            <span className="bill-pipeline-committee-label">{step.label}</span>
                            {stepDateLabel && step.date ? (
                              <time
                                className="bill-pipeline-committee-date"
                                dateTime={step.date}
                              >
                                {stepDateLabel}
                              </time>
                            ) : null}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>

      {committeeStatus ? <p className="bill-pipeline-detail">{committeeStatus}</p> : null}
      {detail ? <p className="bill-pipeline-detail">{detail}</p> : null}
    </div>
  )
}
