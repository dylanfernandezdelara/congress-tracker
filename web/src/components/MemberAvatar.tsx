import { useState } from 'react'

import { memberInitials } from '../utils/memberPhoto'

const VARIANT_CLASSES = {
  defector: {
    root: 'notable-defector-avatar',
    fallback: 'notable-defector-avatar-fallback',
  },
} as const

type MemberAvatarProps = {
  name: string
  photoUrl: string
  /** Compact notable-vote avatar. */
  variant: keyof typeof VARIANT_CLASSES
}

export function MemberAvatar({ name, photoUrl, variant }: MemberAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showPhoto = Boolean(photoUrl) && failedUrl !== photoUrl
  const classes = VARIANT_CLASSES[variant]

  return (
    <span className={classes.root} aria-hidden="true">
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : (
        <span className={classes.fallback}>{memberInitials(name)}</span>
      )}
    </span>
  )
}
