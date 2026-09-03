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
  const placements = tightnessPlacements(dots)

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
          const placement = placements[index] ?? {
            offsetY: 0,
            leftPct: tightnessDotLeftPercent(dot),
          }
          return (
            <li
              key={key}
              className="tightness-dot-item"
              style={{
                // 0–100 on the 50–100 axis; CSS maps it into [radius, 100%-radius].
                ['--tightness-x' as string]: String(placement.leftPct),
                transform: `translate(-50%, calc(-50% + ${placement.offsetY}px))`,
                zIndex: selected ? 20 : 2 + Math.round((100 - placement.leftPct) / 10),
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
/**
 * Live lookback is bimodal (knife-edge ~50% vs steamrolls ~100%). A 4% gap
 * chains those into one cluster; unbounded 10px steps then overflow a ~2rem
 * track onto the row labels. Keep |y| inside the track (0.7rem dots + 2.25rem
 * band leave ~10px of headroom each side).
 */
export const STAGGER_MAX_PX = 10
/** Horizontal step used when a 3-slot y band is already full (~dot width at 320px). */
const STAGGER_X_STEP_PCT = 2.4

function staggerSlotCount(): number {
  return Math.floor((2 * STAGGER_MAX_PX) / STAGGER_STEP_PX) + 1
}

function clusterOffset(indexInCluster: number, clusterSize: number): number {
  return (indexInCluster - (clusterSize - 1) / 2) * STAGGER_STEP_PX
}

export type TightnessPlacement = {
  offsetY: number
  leftPct: number
}

function ySlots(): number[] {
  const slots = staggerSlotCount()
  return Array.from({ length: slots }, (_, slot) => (slot - (slots - 1) / 2) * STAGGER_STEP_PX)
}

function packLargeCluster(
  items: { index: number; left: number }[],
  placements: TightnessPlacement[],
): void {
  const occupied: { x: number; y: number }[] = []
  const slots = ySlots()
  const collides = (x: number, y: number) =>
    occupied.some(
      (dot) => Math.abs(dot.x - x) < STAGGER_X_STEP_PCT && Math.abs(dot.y - y) < STAGGER_STEP_PX,
    )

  for (const item of items) {
    let placed: TightnessPlacement | null = null
    for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
      const leftPct = Math.min(100, Math.max(0, item.left + step * STAGGER_X_STEP_PCT))
      for (const offsetY of slots) {
        if (collides(leftPct, offsetY)) continue
        placed = { offsetY, leftPct }
        break
      }
      if (placed) break
    }
    const next = placed ?? { offsetY: 0, leftPct: item.left }
    placements[item.index] = next
    occupied.push({ x: next.leftPct, y: next.offsetY })
  }
}

/** Place overlapping dots so a knife-edge cluster stays tappable and in-track. */
export function tightnessPlacements(dots: TightnessDot[]): TightnessPlacement[] {
  const ranked = dots
    .map((dot, index) => ({ index, left: tightnessDotLeftPercent(dot) }))
    .sort((a, b) => a.left - b.left || a.index - b.index)

  const placements: TightnessPlacement[] = dots.map((dot) => ({
    offsetY: 0,
    leftPct: tightnessDotLeftPercent(dot),
  }))
  let clusterStart = 0
  const flush = (end: number) => {
    const size = end - clusterStart
    if (size < 2) return
    const cluster = ranked.slice(clusterStart, end)
    if (size <= staggerSlotCount()) {
      for (const [offset, item] of cluster.entries()) {
        if (!item) continue
        placements[item.index] = {
          offsetY: clusterOffset(offset, size),
          leftPct: item.left,
        }
      }
      return
    }
    packLargeCluster(cluster, placements)
  }

  for (let i = 1; i <= ranked.length; i += 1) {
    const prev = ranked[i - 1]
    const curr = ranked[i]
    if (!prev || !curr || curr.left - prev.left > STAGGER_CLUSTER_PCT) {
      flush(i)
      clusterStart = i
    }
  }
  return placements
}

/** Nudge overlapping dots so a knife-edge cluster stays tappable and in-track. */
export function staggerOffsets(dots: TightnessDot[]): number[] {
  return tightnessPlacements(dots).map((placement) => placement.offsetY)
}
