import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"
import { useCallback } from "react"

/**
 * Chip from Vercel AI Elements Suggestion. The horizontal Suggestions
 * scroller is omitted; this pane lays chips on a 2-column CSS grid.
 */
export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string
  onClick?: (suggestion: string) => void
}

export function Suggestion({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) {
  const handleClick = useCallback(() => {
    onClick?.(suggestion)
  }, [onClick, suggestion])

  return (
    <Button
      className={cn("cursor-pointer rounded-full px-4", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  )
}
