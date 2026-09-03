import type { TightnessDot } from '../api/types'
import {
  tightnessDotAriaLabel,
  tightnessDotKey,
  tightnessDotLeftPercent,
} from '../utils/tightnessLabels'

type TightnessStripProps = {
  house: TightnessDot[]
  senate: TightnessDot[]
  selectedKey: string | null
  onSelect: (dot: TightnessDot) => void
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  compact?: boolean
}

export function TightnessStrip({
  house,
  senate,
  selectedKey,
  onSelect,
  loading = false,
  error = null,
  onRetry,
  compact = false,
}: TightnessStripProps) {
  return (
    <section
      className={`tightness${compact ? ' tightness--compact' : ''}`}
      aria-label="Vote tightness"
    >
      <h2 className="sidebar-section-title">Vote tightness</h2>
      <p className="tightness-scale-label">
        50% yea <span className="tightness-scale-mid">knife-edge</span> 100%
      </p>
      {loading ? <p className="text-xs text-faint">Loading tightness…</p> : null}
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
      <TightnessRow
        label="House passage"
        dots={house}
        selectedKey={selectedKey}
        onSelect={onSelect}
        empty="No recent House passage votes."
      />
      <TightnessRow
        label="Senate bills & nominees"
        dots={senate}
        selectedKey={selectedKey}
        onSelect={onSelect}
        empty="No recent Senate votes."
      />
      <p className="tightness-legend">
        <span className="tightness-legend-swatch tightness-dot--party-line" aria-hidden="true" />
        Party-line
        <span className="tightness-legend-swatch tightness-dot--bipartisan" aria-hidden="true" />
        Bipartisan
      </p>
    </section>
  )
}

function TightnessRow({
  label,
  dots,
  selectedKey,
  onSelect,
  empty,
}: {
  label: string
  dots: TightnessDot[]
  selectedKey: string | null
  onSelect: (dot: TightnessDot) => void
  empty: string
}) {
  const offsets = staggerOffsets(dots)

  return (
    <div className="tightness-row" data-tightness-row={label.startsWith('House') ? 'house' : 'senate'}>
      <h3 className="tightness-row-label">{label}</h3>
      <ul className="tightness-track" aria-label={label}>
        <li className="tightness-track-line" aria-hidden="true" />
        {dots.length === 0 ? (
          <li className="tightness-empty-item">
            <p className="tightness-empty">{empty}</p>
          </li>
        ) : null}
        {dots.map((dot, index) => {
          const key = tightnessDotKey(dot)
          const selected = selectedKey === key
          return (
            <li
              key={key}
              className="tightness-dot-item"
              style={{
                left: `clamp(var(--tightness-dot-radius), ${tightnessDotLeftPercent(dot)}%, calc(100% - var(--tightness-dot-radius)))`,
                transform: `translate(-50%, calc(-50% + ${offsets[index] ?? 0}px))`,
                zIndex: selected
                  ? 20
                  : 2 + Math.round((100 - tightnessDotLeftPercent(dot)) / 10),
              }}
            >
              <button
                type="button"
                className={`tightness-dot tightness-dot--${dot.cohesion}${selected ? ' is-selected' : ''}`}
                aria-label={tightnessDotAriaLabel(dot)}
                aria-pressed={selected}
                onClick={() => onSelect(dot)}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Nearby percents (50.2 vs 50.8) sit in different buckets but still overlap. */
const STAGGER_CLUSTER_PCT = 4
const STAGGER_STEP_PX = 10

/** Nudge overlapping dots so a knife-edge cluster stays tappable. */
export function staggerOffsets(dots: TightnessDot[]): number[] {
  const ranked = dots
    .map((dot, index) => ({ index, left: tightnessDotLeftPercent(dot) }))
    .sort((a, b) => a.left - b.left || a.index - b.index)

  const offsets = dots.map(() => 0)
  let clusterStart = 0
  const flush = (end: number) => {
    const size = end - clusterStart
    if (size < 2) return
    for (let i = clusterStart; i < end; i += 1) {
      const item = ranked[i]
      if (!item) continue
      offsets[item.index] = (i - clusterStart - (size - 1) / 2) * STAGGER_STEP_PX
    }
  }

  for (let i = 1; i <= ranked.length; i += 1) {
    const prev = ranked[i - 1]
    const curr = ranked[i]
    if (!prev || !curr || curr.left - prev.left > STAGGER_CLUSTER_PCT) {
      flush(i)
      clusterStart = i
    }
  }
  return offsets
}
