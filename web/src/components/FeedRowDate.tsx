import type { ReactNode } from 'react'

type FeedRowDateProps = {
  dateTime: string
  primary: string
  secondary?: ReactNode
}

/** Left date-rail cell shared by timeline and recent-section rows. */
export function FeedRowDate({ dateTime, primary, secondary }: FeedRowDateProps) {
  return (
    <time className="feed-row-date" dateTime={dateTime}>
      <span className="feed-row-date-primary">{primary}</span>
      {secondary ? <span className="feed-row-date-secondary">{secondary}</span> : null}
    </time>
  )
}
