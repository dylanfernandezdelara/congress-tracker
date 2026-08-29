import type { BillLifecycleStage } from '../utils/billLifecycleStages'
import type { BillJourneyEvent } from '../utils/billJourney'
import { groupJourneyChapters, journeyChapterLabel } from '../utils/billJourneyChapters'
import { formatDateRange, formatVoteDate } from '../utils/billLabels'

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
  const chapters = groupJourneyChapters(journey)
  const showStatus =
    Boolean(processStatus) && !journey.some((event) => event.kind === 'passage_vote')

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

      {chapters.length > 0 ? (
        <section className="bill-pipeline-path">
          <header className="bill-pipeline-path-head">
            <h3 className="feed-row-detail-heading">Path through Congress</h3>
            {showStatus ? (
              <p className="bill-pipeline-process-status">{processStatus}</p>
            ) : null}
          </header>
          <ol className="bill-pipeline-path-chapters" aria-label="Path through Congress">
            {chapters.map((chapter) => (
              <li key={chapter.key} className="bill-pipeline-path-chapter">
                <h4 className="bill-pipeline-path-chamber">{journeyChapterLabel(chapter.id)}</h4>
                <ol className="bill-pipeline-path-runs">
                  {chapter.runs.map((run) => {
                    const dateLabel = formatDateRange(run.dateStart, run.dateEnd)
                    const dateTime = run.dateEnd ?? run.dateStart
                    return (
                      <li key={run.id} className="bill-pipeline-path-run">
                        <p className="bill-pipeline-path-copy">
                          {run.subject ? (
                            <span className="bill-pipeline-path-subject">{run.subject}</span>
                          ) : null}
                          {run.beats.map((beat, index) => (
                            <span key={`${run.id}-${index}`}>
                              {run.subject || index > 0 ? (
                                <span className="bill-pipeline-path-dot" aria-hidden="true">
                                  {' · '}
                                </span>
                              ) : null}
                              <span
                                className={`bill-pipeline-path-beat${
                                  beat.failed ? ' bill-pipeline-path-beat--failed' : ''
                                }`}
                              >
                                {beat.text}
                              </span>
                            </span>
                          ))}
                        </p>
                        {dateLabel && dateTime ? (
                          <time className="bill-pipeline-path-date" dateTime={dateTime}>
                            {dateLabel}
                          </time>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {detail ? <p className="bill-pipeline-detail">{detail}</p> : null}
    </div>
  )
}
