import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import { MemberProfileProvider } from '../components/MemberProfileProvider'
import { TooltipTestProvider } from './tooltipHarness'

function MemberProfileTestProviders({ children }: { children: ReactNode }) {
  return (
    <TooltipTestProvider>
      <MemberProfileProvider>{children}</MemberProfileProvider>
    </TooltipTestProvider>
  )
}

/**
 * Renders isolated component tests that call `useOpenMemberProfile`. Detail
 * panels also mount the bill chat, whose toolbar needs AppLayout's
 * `TooltipProvider`.
 */
export function renderWithMemberProfile(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: MemberProfileTestProviders, ...options })
}
