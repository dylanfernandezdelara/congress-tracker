import { useCallback, type ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type SuggestionsProps = ComponentProps<'div'>

export function Suggestions({ className, ...props }: SuggestionsProps) {
  return <div className={cn('bill-chat-suggestions', className)} {...props} />
}

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  suggestion: string
  onClick?: (suggestion: string) => void
}

export function Suggestion({
  suggestion,
  onClick,
  className,
  variant = 'outline',
  size = 'sm',
  children,
  ...props
}: SuggestionProps) {
  const handleClick = useCallback(() => {
    onClick?.(suggestion)
  }, [onClick, suggestion])

  return (
    <Button
      className={cn('bill-chat-suggestion', className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  )
}
