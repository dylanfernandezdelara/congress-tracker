import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { congressGovBillUrl, getBillColloquialName } from '../utils/billLabels'

type ProfileBillRowProps = {
  billId: string
  congress: number
  billType: string
  billNumber: number
  title?: string | null
  headline?: string | null
  inFeed: boolean
  onAfterNavigate?: () => void
  children: ReactNode
}

const linkClass = 'flex min-w-0 flex-col gap-0.5 no-underline'

export function ProfileBillRow({
  billId,
  congress,
  billType,
  billNumber,
  title,
  headline,
  inFeed,
  onAfterNavigate,
  children,
}: ProfileBillRowProps) {
  const [searchParams] = useSearchParams()
  const displayTitle = getBillColloquialName({
    congress,
    type: billType,
    number: billNumber,
    title,
    headline,
  })
  const headlineEl = (
    <span
      className="line-clamp-2 text-[0.8125rem] font-semibold text-foreground"
      title={displayTitle}
    >
      {displayTitle}
    </span>
  )

  if (inFeed) {
    const next = new URLSearchParams(searchParams)
    next.set('bill', billId)
    return (
      <Link
        to={{ pathname: '/', search: `?${next}` }}
        className={linkClass}
        onClick={() => {
          queueMicrotask(() => onAfterNavigate?.())
        }}
      >
        {headlineEl}
        {children}
      </Link>
    )
  }

  return (
    <a
      href={congressGovBillUrl(congress, billType, billNumber)}
      className={linkClass}
      target="_blank"
      rel="noopener noreferrer"
    >
      {headlineEl}
      {children}
      <span className="sr-only"> — opens Congress.gov</span>
    </a>
  )
}
