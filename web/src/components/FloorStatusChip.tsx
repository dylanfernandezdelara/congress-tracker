import { useId, useState } from 'react'

import { formatVoteDate, formatWeekdayVoteDate } from '../utils/billLabels'
import type { ChamberFloorDetail } from '../utils/feedQuiet'
import { chamberReturnCopy, floorStatusTogetherCopy } from '../utils/floorStatusCopy'
import { AnimatedSheet } from './AnimatedSheet'

function ChamberStatusRow({ detail }: { detail: ChamberFloorDetail }) {
  const returnCopy = chamberReturnCopy(detail, formatWeekdayVoteDate)
  return (
    <section className="floor-status-chamber" aria-label={detail.chamber}>
      <h3 className="floor-status-chamber-name">{detail.chamber}</h3>
      <p className="floor-status-chamber-status">{detail.statusLabel ?? 'Unknown'}</p>
      {returnCopy ? <p className="floor-status-chamber-back">{returnCopy}</p> : null}
      {detail.lastActivityDay ? (
        <p className="floor-status-chamber-meta">
          Last floor activity {formatVoteDate(detail.lastActivityDay)}
        </p>
      ) : null}
      {detail.periodLabel ? (
        <p className="floor-status-chamber-meta">{detail.periodLabel}</p>
      ) : null}
    </section>
  )
}

type FloorStatusSheetProps = {
  open: boolean
  selectionKey: number
  onClose: () => void
  statusLabel: string
  house: ChamberFloorDetail
  senate: ChamberFloorDetail
}

export function FloorStatusSheet({
  open,
  selectionKey,
  onClose,
  statusLabel,
  house,
  senate,
}: FloorStatusSheetProps) {
  const titleId = useId()
  const together = floorStatusTogetherCopy(house, senate, formatWeekdayVoteDate)

  return (
    <AnimatedSheet
      open={open}
      selectionKey={selectionKey}
      onClose={onClose}
      titleId={titleId}
      closeAriaLabel="Close floor status"
      panelClassName="floor-status-sheet"
    >
      <header className="floor-status-sheet-header">
        <p className="floor-status-sheet-kicker">{statusLabel}</p>
        <h2 id={titleId} className="floor-status-sheet-title">
          Floor status
        </h2>
        <p className="floor-status-sheet-lead">{together}</p>
      </header>

      <ChamberStatusRow detail={house} />
      <ChamberStatusRow detail={senate} />

      <section className="sheet-section" aria-label="Official calendars">
        <h3 className="sheet-section-title">Calendars</h3>
        <a
          className="sheet-link congress-link"
          href={house.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {house.sourceName} ↗
        </a>
        <a
          className="sheet-link congress-link"
          href={senate.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {senate.sourceName} ↗
        </a>
      </section>
    </AnimatedSheet>
  )
}

type FloorStatusChipProps = {
  label: string | null
  house: ChamberFloorDetail
  senate: ChamberFloorDetail
}

export function FloorStatusChip({ label, house, senate }: FloorStatusChipProps) {
  const [open, setOpen] = useState(false)
  const [selectionKey, setSelectionKey] = useState(0)

  if (!label) return null

  const recessHint = label === 'In recess' ? ' Show when the House and Senate return.' : ''

  return (
    <>
      <button
        type="button"
        className="home-feed-floor-status"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}.${recessHint || ' Show House and Senate floor status.'}`}
        onClick={() => {
          setSelectionKey((key) => key + 1)
          setOpen(true)
        }}
      >
        {label}
      </button>
      <FloorStatusSheet
        open={open}
        selectionKey={selectionKey}
        statusLabel={label}
        house={house}
        senate={senate}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
