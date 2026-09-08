import type { ReactNode } from 'react'

import { prefetchMemberProfile } from '../api/memberProfileCache'
import { cn } from '../lib/utils'
import { canOpenMemberProfile } from '../utils/memberProfileOpen'
import type { MemberProfileSeed } from './MemberProfile'
import { useOpenMemberProfile } from './MemberProfileProvider'

export type MemberProfileTriggerProps = {
  seed: MemberProfileSeed
  children: ReactNode
  className?: string
  /** `inline` for sponsor / spotlight / passage-vote names; `row` for avatar rows. */
  variant?: 'inline' | 'row'
}

/**
 * Shared member-name control. Interactive only when `canOpenMemberProfile`
 * is true; `LIS:` / empty ids render as text and never call the profile hook.
 */
export function MemberProfileTrigger({
  seed,
  children,
  className,
  variant = 'inline',
}: MemberProfileTriggerProps) {
  if (!canOpenMemberProfile(seed.bioguide_id)) {
    const staticClass = cn(
      variant === 'row' && 'member-profile-trigger-static member-profile-trigger-static--row',
      className,
    )
    if (!staticClass) return children
    return <span className={staticClass}>{children}</span>
  }

  return (
    <MemberProfileTriggerButton seed={seed} className={className} variant={variant}>
      {children}
    </MemberProfileTriggerButton>
  )
}

function MemberProfileTriggerButton({
  seed,
  children,
  className,
  variant,
}: {
  seed: MemberProfileSeed
  children: ReactNode
  className?: string
  variant: 'inline' | 'row'
}) {
  const openProfile = useOpenMemberProfile()

  return (
    <button
      type="button"
      className={cn('member-profile-trigger', `member-profile-trigger--${variant}`, className)}
      aria-label={`Open profile for ${seed.name}`}
      onMouseEnter={() => prefetchMemberProfile(seed.bioguide_id)}
      onFocus={() => prefetchMemberProfile(seed.bioguide_id)}
      onClick={() => openProfile(seed)}
    >
      {children}
    </button>
  )
}
