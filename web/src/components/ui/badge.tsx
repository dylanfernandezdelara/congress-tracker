import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-[0.65rem] border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors',
  {
    variants: {
      variant: {
        default: 'border-primary/20 bg-primary/[0.07] text-primary',
        secondary: 'border-border/70 bg-secondary/65 text-secondary-foreground',
        outline: 'border-border bg-transparent text-foreground',
        destructive: 'border-destructive/20 bg-destructive/[0.08] text-destructive',
        success: 'border-emerald-900/10 bg-emerald-950/[0.05] text-emerald-950',
        muted: 'border-border/70 bg-background/65 text-muted-foreground',
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
