import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function CaseNote({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={cn('note-panel', className)}>
      <p className="document-label">{label}</p>
      <div className="mt-2 text-sm leading-6 text-foreground">{value}</div>
    </div>
  )
}

export function StatBlock({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={cn('evidence-block', className)}>
      <p className="document-label">{label}</p>
      <div className="mt-3 text-3xl font-semibold leading-none tabular-nums text-foreground">{value}</div>
    </div>
  )
}
