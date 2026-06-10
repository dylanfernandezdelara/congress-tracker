import { type KeyboardEvent, type ReactNode, useId, useState } from 'react'

type FlipCardProps = {
  front: ReactNode
  back: ReactNode
  flipLabel?: string
  backLabel?: string
}

export function FlipCard({
  front,
  back,
  flipLabel = 'Flip to official summary',
  backLabel = 'Back to plain summary',
}: FlipCardProps) {
  const [flipped, setFlipped] = useState(false)
  const id = useId()

  const toggle = () => setFlipped((v) => !v)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <article className="flip-card" aria-labelledby={`${id}-title`}>
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
      <p className="garden-meta mt-4 text-center normal-case tracking-normal sm:mt-5" aria-hidden="true">
        {flipped ? 'Tap to return' : 'Tap card to flip'}
      </p>
    </article>
  )
}
