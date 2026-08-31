import { useState } from 'react'

import type { BillLifecycleStage } from '../utils/billLifecycleStages'
import type { BillJourneyEvent } from '../utils/billJourney'
import type {
  JourneyBeat,
  JourneyCommitteeRun,
  JourneyRun,
  JourneyStepRun,
} from '../utils/billJourneyChapters'
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

function beatClassName(failed: boolean): string {
  return failed ? 'bill-pipeline-path-beat bill-pipeline-path-beat--failed' : 'bill-pipeline-path-beat'
}

function PathDate({ date, label }: { date: string | null; label: string | null }) {
  if (!label || !date) return null
  return (
    <time className="bill-pipeline-path-date" dateTime={date}>
      {label}
    </time>
  )
}

function PathBeatRow({ beat }: { beat: JourneyBeat }) {
  return (
    <li className="bill-pipeline-path-beat-row">
      <span className={beatClassName(beat.failed)}>{beat.text}</span>
      <PathDate date={beat.date} label={beat.date ? formatVoteDate(beat.date) : null} />
    </li>
  )
}

function PathFoldRun({ run }: { run: JourneyCommitteeRun }) {
  const [open, setOpen] = useState(true)
  const rangeLabel = formatDateRange(run.dateStart, run.dateEnd)
  const rangeDate = run.dateEnd ?? run.dateStart

  return (
    <details
      className="bill-pipeline-path-fold"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
      }}
    >
      <summary className="bill-pipeline-path-fold-summary">
        <span className="bill-pipeline-path-subject">{run.subject}</span>
        <PathDate date={rangeDate} label={rangeLabel} />
      </summary>
      <ol className="bill-pipeline-path-beats">
        {run.beats.map((item, index) => (
          <PathBeatRow key={`${item.id}-${index}`} beat={item} />
        ))}
      </ol>
    </details>
  )
}

function PathStep({ run }: { run: JourneyStepRun }) {
  return (
    <div className="bill-pipeline-path-step">
      <span className={beatClassName(run.beat.failed)}>{run.beat.text}</span>
      <PathDate
        date={run.beat.date}
        label={run.beat.date ? formatVoteDate(run.beat.date) : null}
      />
    </div>
  )
}

function PathRunItem({ run }: { run: JourneyRun }) {
  return run.kind === 'committee' ? <PathFoldRun run={run} /> : <PathStep run={run} />
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
                  {chapter.runs.map((run) => (
                    <li key={run.id} className="bill-pipeline-path-run">
                      <PathRunItem run={run} />
                    </li>
                  ))}
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
