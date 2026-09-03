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
          const placement = placements[index]
          if (!placement) return null
          const trueLeft = tightnessDotLeftPercent(dot)
          return (
            <li
              key={key}
              className="tightness-dot-item"
              style={{
                // 0–100 on the 50–100 axis. CSS insets into [radius, 100%-radius]
                // with a unitless ratio so WebKit does not drop the length.
                ['--tightness-x' as string]: String(placement.leftPct),
                transform: `translate(-50%, calc(-50% + ${placement.offsetY}px))`,
                zIndex: selected ? 20 : 2 + Math.round((100 - trueLeft) / 10),
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
const STAGGER_STEP_PX = 12
/**
 * A 4% neighbor gap chains the knife-edge pile (or the steamroll pile) into
 * one cluster. Unbounded 10px y-steps then overflow a ~2rem track onto the
 * row labels. Keep |y| inside the track (0.7rem dots + 2.5rem band leave
 * ~12px of headroom each side). The two piles sit ~85 axis-points apart, so
 * they never join.
 */
export const STAGGER_MAX_PX = 12
/** Narrowest rail we layout for; used so an x-step is at least one mark wide. */
export const TIGHTNESS_MIN_TRACK_PX = 248
export const TIGHTNESS_DOT_MARK_PX = 12
/** One extra lattice column is at least a desktop mark wide on the narrow rail. */
export const STAGGER_X_STEP_PCT = (TIGHTNESS_DOT_MARK_PX / TIGHTNESS_MIN_TRACK_PX) * 100

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

/** Extra columns walk toward 50% from one cluster origin so true-x marks cannot collide. */
function columnShift(origin: number, column: number): number {
  const towardInterior = origin < 50 ? 1 : -1
  return Math.min(100, Math.max(0, origin + column * STAGGER_X_STEP_PCT * towardInterior))
}

export function placementDistancePx(
  a: TightnessPlacement,
  b: TightnessPlacement,
  trackPx = TIGHTNESS_MIN_TRACK_PX,
): number {
  const dx = ((a.leftPct - b.leftPct) / 100) * trackPx
  return Math.hypot(dx, a.offsetY - b.offsetY)
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
    const slots = ySlots()
    const first = cluster[0]
    const last = cluster[cluster.length - 1]
    const origin = first && last ? (first.left < 50 ? first.left : last.left) : 0
    for (const [offset, item] of cluster.entries()) {
      if (!item) continue
      if (size <= slots.length) {
        placements[item.index] = {
          offsetY: clusterOffset(offset, size),
          leftPct: item.left,
        }
        continue
      }
      placements[item.index] = {
        offsetY: slots[offset % slots.length] ?? 0,
        leftPct: columnShift(origin, Math.floor(offset / slots.length)),
      }
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
  return placements
}
