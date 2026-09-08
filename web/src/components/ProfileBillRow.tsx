import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type ProfileBillRowProps = {
  title: string
  href: string
  inFeed: boolean
  onAfterNavigate?: () => void
  children: ReactNode
}

const linkClass = 'flex min-w-0 flex-col gap-0.5 no-underline'

export function ProfileBillRow({
  title,
  href,
  inFeed,
  onAfterNavigate,
  children,
}: ProfileBillRowProps) {
  const headline = (
    <span
      className="line-clamp-2 text-[0.8125rem] font-semibold text-foreground"
      title={title}
    >
      {title}
    </span>
  )

  if (inFeed) {
    return (
      <Link
        to={href}
        className={linkClass}
        onClick={() => {
          queueMicrotask(() => onAfterNavigate?.())
        }}
      >
        {headline}
        {children}
      </Link>
    )
  }

  return (
    <a
      href={href}
      className={linkClass}
      target="_blank"
      rel="noreferrer"
      aria-label={`${title} (opens Congress.gov)`}
    >
      {headline}
      {children}
    </a>
  )
}
