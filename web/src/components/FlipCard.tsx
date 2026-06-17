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
  flipLabel = 'Flip to official CRS summary',
  backLabel = 'Back to plain summary',
}: FlipCardProps) {
  const [flipped, setFlipped] = useState(false)
  const [backScrolledToEnd, setBackScrolledToEnd] = useState(false)
  const id = useId()
  const labelledBy = titleId ?? `${id}-title`
  const pointerStart = useRef<{ x: number; y: number; scrollTop?: number } | null>(null)
  const frontClipRef = useRef<HTMLDivElement>(null)
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
    const content = el.firstElementChild
    if (content) observer.observe(content)
    return () => observer.disconnect()
  }, [flipped, updateBackScrollEnd])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const clip = flipped ? backClipRef.current : frontClipRef.current
    pointerStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollTop: clip?.scrollTop,
    }
  }

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const start = pointerStart.current
    pointerStart.current = null
    const endScrollTop = (flipped ? backClipRef.current : frontClipRef.current)?.scrollTop
    if (
      start &&
      shouldIgnoreFlipClick(
        start.x,
        start.y,
        e.clientX,
        e.clientY,
        undefined,
        start.scrollTop,
        endScrollTop,
      )
    ) {
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

  const onBackClipKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = backClipRef.current
    if (!el) return

    let delta = 0
    switch (e.key) {
      case 'ArrowDown':
        delta = 48
        break
      case 'ArrowUp':
        delta = -48
        break
      case 'PageDown':
        delta = el.clientHeight * 0.9
        break
      case 'PageUp':
        delta = -el.clientHeight * 0.9
        break
      case 'Home':
        el.scrollTop = 0
        updateBackScrollEnd()
        e.preventDefault()
        e.stopPropagation()
        return
      case 'End':
        el.scrollTop = el.scrollHeight
        updateBackScrollEnd()
        e.preventDefault()
        e.stopPropagation()
        return
      case ' ':
      case 'Enter':
        e.stopPropagation()
        return
      default:
        return
    }

    el.scrollTop += delta
    updateBackScrollEnd()
    e.preventDefault()
    e.stopPropagation()
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
        <div className="flip-card-face flip-card-front" ref={frontClipRef}>
          <div className="flip-card-content">{front}</div>
        </div>
        <div className="flip-card-face flip-card-back">
          <div
            ref={backClipRef}
            className={`flip-card-back-clip ${backScrolledToEnd ? 'is-scrolled-to-end' : ''}`}
            role="region"
            aria-label="Official CRS summary"
            tabIndex={flipped ? 0 : -1}
            onScroll={updateBackScrollEnd}
            onKeyDown={onBackClipKeyDown}
          >
            <div className="flip-card-back-body">{back}</div>
          </div>
        </div>
      </div>
    </article>
  )
}
