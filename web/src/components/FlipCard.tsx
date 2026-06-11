import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { shouldIgnoreFlipClick } from '../utils/flipCardInteraction'

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
  const [backScrolledToEnd, setBackScrolledToEnd] = useState(false)
  const id = useId()
  const labelledBy = titleId ?? `${id}-title`
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const backClipRef = useRef<HTMLDivElement>(null)

  const toggle = () => setFlipped((v) => !v)

  const updateBackScrollEnd = useCallback(() => {
    const el = backClipRef.current
    if (!el) return
    const noOverflow = el.scrollHeight <= el.clientHeight + 4
    const scrolledToEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
    setBackScrolledToEnd(noOverflow || scrolledToEnd)
  }, [])

  useLayoutEffect(() => {
    if (!flipped) {
      setBackScrolledToEnd(false)
      return
    }
    updateBackScrollEnd()
    const el = backClipRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateBackScrollEnd)
    observer.observe(el)
    return () => observer.disconnect()
  }, [flipped, back, updateBackScrollEnd])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: e.clientX, y: e.clientY }
  }

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const start = pointerStart.current
    pointerStart.current = null
    if (start && shouldIgnoreFlipClick(start.x, start.y, e.clientX, e.clientY)) {
      return
    }
    toggle()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <article className="flip-card" aria-labelledby={labelledBy}>
      <div
        className={`flip-card-inner ${flipped ? 'is-flipped' : ''}`}
        role="button"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onKeyDown={onKeyDown}
        aria-pressed={flipped}
        aria-label={flipped ? backLabel : flipLabel}
      >
        <div className="flip-card-face flip-card-front">
          <div className="flip-card-content">{front}</div>
        </div>
        <div className="flip-card-face flip-card-back">
          <div
            ref={backClipRef}
            className={`flip-card-back-clip ${backScrolledToEnd ? 'is-scrolled-to-end' : ''}`}
            onScroll={updateBackScrollEnd}
          >
            <div className="flip-card-content">{back}</div>
          </div>
        </div>
      </div>
    </article>
  )
}
