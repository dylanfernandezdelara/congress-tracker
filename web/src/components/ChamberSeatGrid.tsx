import { partyCssClass } from '@congress-tracker/shared/party'

import type { PartySeatCount } from '../api/types'
import { buildPartySeatBlocks, seatGridAriaLabel } from '../utils/chamberSeatGrid'

type ChamberSeatGridProps = {
  chamber: 'House' | 'Senate'
  seats: PartySeatCount[]
  total: number
  seatParties?: string[] | null
  seatOnBallot?: boolean[] | null
  electionYear: number
}

export function ChamberSeatGrid({
  chamber,
  seats,
  total,
  seatParties,
  seatOnBallot,
  electionYear,
}: ChamberSeatGridProps) {
  if (total === 0) {
    return (
      <div className="chamber-seat-grid chamber-seat-grid--empty" aria-hidden="true">
        <span className="chamber-seat-grid-empty">Member roster not loaded yet</span>
      </div>
    )
  }

  const hasMemberSeatParties = Boolean(seatParties) && seatParties!.length === total
  const blocks = buildPartySeatBlocks(seats, seatParties, seatOnBallot)
  const ballotTotal = blocks.reduce(
    (sum, block) => sum + block.seats.filter((seat) => seat.onBallot).length,
    0
  )
  const chamberClass = chamber === 'House' ? 'chamber-seat-grid--house' : 'chamber-seat-grid--senate'

  return (
    <div className={`chamber-seat-grid-wrap ${chamberClass}`}>
      <div
        className={`chamber-party-blocks ${chamberClass}`}
        role="img"
        aria-label={seatGridAriaLabel(chamber, seats, total, ballotTotal, electionYear, {
          perMember: hasMemberSeatParties,
        })}
      >
        {blocks.map((block) => (
          <div
            key={block.party}
            className={`chamber-party-block ${partyCssClass(block.party)}`}
            style={{ flexGrow: block.seats.length, flexBasis: 0 }}
          >
            <div className="chamber-party-block-grid">
              {block.seats.map((seat, index) => (
                <span
                  key={`${block.party}-${index}`}
                  className={[
                    'chamber-seat-tile',
                    partyCssClass(seat.party),
                    seat.onBallot ? 'chamber-seat-tile--ballot' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {ballotTotal > 0 && chamber === 'Senate' ? (
        <p className="chamber-ballot-key">
          Pulsing tiles (~{ballotTotal}) show the {electionYear} Senate seats up by party share
        </p>
      ) : null}
      {chamber === 'House' && total > 0 ? (
        <p className="chamber-ballot-key chamber-ballot-key--house">
          Unlike the Senate, the full House runs every two years — every seat above is on the
          November {electionYear} ballot
        </p>
      ) : null}
    </div>
  )
}
