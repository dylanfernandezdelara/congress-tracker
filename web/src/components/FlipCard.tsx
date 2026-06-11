import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

import { shouldIgnoreFlipClick } from '../utils/flipCardInteraction'

export const TOUCH_LAYOUT_MEDIA_QUERY = '(max-width: 639px), (pointer: coarse)'

function readTouchLayout(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia(TOUCH_LAYOUT_MEDIA_QUERY).matches
  )
}

type FlipCardProps = {
  front: ReactNode
  back: ReactNode
  titleId?: string
  flipLabel?: string
  backLabel?: string
}

export function FlipCard({
  front,
  back,
  titleId,
  flipLabel = 'Flip to official summary',
  backLabel = 'Back to plain summary',
}: FlipCardProps) {
  const [flipped, setFlipped] = useState(false)
  const [touchLayout, setTouchLayout] = useState(readTouchLayout)
  const id = useId()
  const labelledBy = titleId ?? `${id}-title`
  const pointerStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(TOUCH_LAYOUT_MEDIA_QUERY)
    const sync = () => setTouchLayout(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const toggle = () => setFlipped((v) => !v)

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (touchLayout) return
    pointerStart.current = { x: e.clientX, y: e.clientY }
  }

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (touchLayout) return
    const start = pointerStart.current
    pointerStart.current = null
    if (start && shouldIgnoreFlipClick(start.x, start.y, e.clientX, e.clientY)) {
      return
    }
    toggle()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <article className="flip-card" aria-labelledby={labelledBy}>
      <div
        className={`flip-card-inner ${flipped ? 'is-flipped' : ''}`}
        role={touchLayout ? undefined : 'button'}
        tabIndex={touchLayout ? undefined : 0}
        onPointerDown={touchLayout ? undefined : onPointerDown}
        onClick={touchLayout ? undefined : onClick}
        onKeyDown={touchLayout ? undefined : onKeyDown}
        aria-pressed={touchLayout ? undefined : flipped}
        aria-label={touchLayout ? undefined : flipped ? backLabel : flipLabel}
      >
        <div className="flip-card-face flip-card-front">{front}</div>
        <div className="flip-card-face flip-card-back">
          <div className="flip-card-back-clip">{back}</div>
        </div>
      </div>
      {touchLayout ? (
        <button
          type="button"
          className="flip-card-hint mt-4 w-full text-center text-[12px] text-secondary sm:mt-5"
          onClick={toggle}
          onKeyDown={onKeyDown}
          aria-pressed={flipped}
          aria-label={flipped ? backLabel : flipLabel}
        >
          {flipped ? 'Tap to return' : 'Tap here to flip'}
        </button>
      ) : null}
    </article>
  )
}
