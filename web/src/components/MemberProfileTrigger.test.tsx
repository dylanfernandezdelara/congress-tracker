import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearMemberProfileCache } from '../api/memberProfileCache'
import { renderWithMemberProfile } from '../test/memberProfileHarness'
import { resetSheetLayerForTests } from '../utils/sheetLayer'
import type { MemberProfileSeed } from './MemberProfile'
import { MemberProfileTrigger } from './MemberProfileTrigger'

vi.mock('../api/client', () => ({
  fetchMemberProfile: vi.fn(),
}))

const seed: MemberProfileSeed = {
  bioguide_id: 'F000466',
  name: 'Brian Fitzpatrick',
  party: 'R',
  state: 'PA',
}

afterEach(() => {
  vi.clearAllMocks()
  clearMemberProfileCache()
  resetSheetLayerForTests()
  document.body.style.overflow = ''
})

describe('MemberProfileTrigger', () => {
  it('renders LIS: and empty ids as plain text without calling the profile hook', () => {
    render(
      <MemberProfileTrigger
        seed={{ ...seed, bioguide_id: 'LIS:S123', name: 'Sen. Placeholder' }}
        className="feed-row-sponsor-name"
      >
        Sen. Placeholder
      </MemberProfileTrigger>,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Sen. Placeholder')).toBeInTheDocument()
    expect(screen.getByText('Sen. Placeholder').tagName).toBe('SPAN')
  })

  it('opens the member profile for a real bioguide', () => {
    renderWithMemberProfile(
      <MemberProfileTrigger seed={seed}>Brian Fitzpatrick</MemberProfileTrigger>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open profile for Brian Fitzpatrick' }))
    expect(screen.getByRole('dialog', { name: 'Brian Fitzpatrick' })).toBeInTheDocument()
  })
})
