import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import { TooltipProvider } from '../components/ui/tooltip'

export function TooltipTestProvider({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
}

/** Isolated chat tests do not mount AppLayout's TooltipProvider. */
export function renderWithTooltip(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: TooltipTestProvider, ...options })
}
