import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/12 text-primary',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-border bg-background/70 text-foreground',
        destructive: 'bg-destructive/12 text-destructive',
        success: 'bg-emerald-700/10 text-emerald-800',
        muted: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
