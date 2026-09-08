import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement } from 'react'

import { MemberProfileProvider } from '../components/MemberProfileProvider'

/** Renders isolated component tests that call `useOpenMemberProfile`. */
export function renderWithMemberProfile(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: MemberProfileProvider, ...options })
}
