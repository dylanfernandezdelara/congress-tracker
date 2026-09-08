import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

import { MemberProfileProvider } from '../components/MemberProfileProvider'

/** Wraps isolated component tests that call `useOpenMemberProfile`. */
export function MemberProfileTestProvider({ children }: { children: ReactNode }) {
  return <MemberProfileProvider>{children}</MemberProfileProvider>
}

export function renderWithMemberProfile(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: MemberProfileTestProvider, ...options })
}
