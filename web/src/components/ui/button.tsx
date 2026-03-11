import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-[0.9rem] border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground hover:bg-primary/92',
        secondary: 'border-border bg-secondary/70 text-secondary-foreground hover:bg-secondary/85',
        outline: 'border-border bg-background/70 text-foreground hover:bg-muted/70',
        ghost: 'border-transparent bg-transparent text-foreground hover:bg-muted/55',
        link: 'border-transparent bg-transparent px-0 text-primary underline decoration-primary/30 underline-offset-4 hover:text-foreground hover:decoration-foreground/30',
        destructive: 'border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/92',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-[0.72rem] uppercase tracking-[0.14em]',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10 rounded-[0.9rem]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
