import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

import { MemberProfile, type MemberProfileSeed } from './MemberProfile'

export type OpenMemberProfile = (seed: MemberProfileSeed) => void

const MemberProfileContext = createContext<OpenMemberProfile | null>(null)

type Selection = { seed: MemberProfileSeed; key: number }

/**
 * Single app-level member profile sheet. `openProfile` always bumps
 * `selectionKey` — including when the same member is re-selected — so a
 * pending animated close is cancelled (see `MemberProfile`).
 */
export function MemberProfileProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection | null>(null)

  const openProfile = useCallback<OpenMemberProfile>((seed) => {
    setSelection((prev) => ({ seed, key: (prev?.key ?? 0) + 1 }))
  }, [])

  const closeProfile = useCallback(() => {
    setSelection(null)
  }, [])

  return (
    <MemberProfileContext.Provider value={openProfile}>
      {children}
      <MemberProfile
        open={selection !== null}
        seed={selection?.seed ?? null}
        selectionKey={selection?.key ?? 0}
        onClose={closeProfile}
      />
    </MemberProfileContext.Provider>
  )
}

export function useOpenMemberProfile(): OpenMemberProfile {
  const openProfile = useContext(MemberProfileContext)
  if (!openProfile) {
    throw new Error('useOpenMemberProfile must be used within MemberProfileProvider')
  }
  return openProfile
}
