import type { TightnessDot } from '../api/types'
import {
  HOUSE_CLOSEST_LIMIT,
  HOUSE_MARGIN_CAP,
  SENATE_CLOSEST_LIMIT,
  SENATE_MARGIN_CAP,
  selectClosestVotes,
  tightnessBarLabel,
  tightnessBarWidth,
  tightnessDotAriaLabel,
  tightnessDotKey,
} from '../utils/tightnessLabels'

type TightnessStripProps = {
  house: TightnessDot[]
  senate: TightnessDot[]
  selectedKey: string | null
  onSelect: (dot: TightnessDot) => void
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}

export function TightnessStrip({
  house,
  senate,
  selectedKey,
  onSelect,
  loading = false,
  error = null,
  onRetry,
}: TightnessStripProps) {
  const houseRows = selectClosestVotes(house, HOUSE_MARGIN_CAP, HOUSE_CLOSEST_LIMIT)
  const senateRows = selectClosestVotes(senate, SENATE_MARGIN_CAP, SENATE_CLOSEST_LIMIT)

  return (
    <section className="tightness" aria-label="Vote tightness">
      <h2 className="sidebar-section-title">Closest votes</h2>
      {loading ? <p className="text-xs text-faint">Loading closest votes…</p> : null}
      {error ? (
        <div className="space-y-2">
          <p className="text-xs text-fail">{error}</p>
          {onRetry ? (
            <button type="button" className="ghost-button text-xs" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <TightnessChamber
        chamber="house"
        label="House passage"
        rows={houseRows}
        cap={HOUSE_MARGIN_CAP}
        selectedKey={selectedKey}
        onSelect={onSelect}
        empty="No close House passage votes."
      />
      <TightnessChamber
        chamber="senate"
        label="Senate bills & nominees"
        rows={senateRows}
        cap={SENATE_MARGIN_CAP}
        selectedKey={selectedKey}
        onSelect={onSelect}
        empty="No close Senate votes."
      />
      <p className="tightness-legend">
        <span className="tightness-legend-swatch tightness-bar-fill--party-line" aria-hidden="true" />
        Party-line
        <span className="tightness-legend-swatch tightness-bar-fill--bipartisan" aria-hidden="true" />
        Bipartisan
      </p>
    </section>
  )
}

function TightnessChamber({
  chamber,
  label,
  rows,
  cap,
  selectedKey,
  onSelect,
  empty,
}: {
  chamber: 'house' | 'senate'
  label: string
  rows: TightnessDot[]
  cap: number
  selectedKey: string | null
  onSelect: (dot: TightnessDot) => void
  empty: string
}) {
  return (
    <div className="tightness-row" data-tightness-row={chamber}>
      <h3 className="tightness-row-label">{label}</h3>
      <ul className="tightness-bars" aria-label={label}>
        {rows.length === 0 ? (
          <li>
            <p className="tightness-empty">{empty}</p>
          </li>
        ) : null}
        {rows.map((dot) => {
          const key = tightnessDotKey(dot)
          const selected = selectedKey === key
          const width = tightnessBarWidth(dot, cap)
          return (
            <li key={key}>
              <button
                type="button"
                className={`tightness-bar-row${selected ? ' is-selected' : ''}`}
                style={{ ['--tightness-bar' as string]: String(width) }}
                aria-label={tightnessDotAriaLabel(dot)}
                aria-pressed={selected}
                onClick={() => onSelect(dot)}
              >
                <span className="tightness-bar-label">{tightnessBarLabel(dot)}</span>
                <span className="tightness-bar-track" aria-hidden="true">
                  <span className={`tightness-bar-fill tightness-bar-fill--${dot.cohesion}`} />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
