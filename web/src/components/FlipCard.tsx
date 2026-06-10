import { type KeyboardEvent, type ReactNode, useId, useState } from 'react'

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
  const id = useId()
  const labelledBy = titleId ?? `${id}-title`

  const toggle = () => setFlipped((v) => !v)

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
        onClick={toggle}
        onKeyDown={onKeyDown}
        aria-pressed={flipped}
        aria-label={flipped ? backLabel : flipLabel}
      >
        <div className="flip-card-face flip-card-front">{front}</div>
        <div className="flip-card-face flip-card-back">{back}</div>
      </div>
    </article>
  )
}
