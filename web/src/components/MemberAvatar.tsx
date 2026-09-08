import { memberInitials } from '../utils/memberPhoto'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const VARIANT_CLASSES = {
  defector: {
    root: 'h-5 w-5',
    fallback: 'text-[12px] font-medium text-secondary',
  },
  profile: {
    root: 'h-16 w-16',
    fallback: 'text-lg font-bold text-secondary',
  },
} as const

type MemberAvatarProps = {
  name: string
  photoUrl: string
  /** Compact notable-vote avatar or the larger profile-sheet avatar. */
  variant: keyof typeof VARIANT_CLASSES
}

export function MemberAvatar({ name, photoUrl, variant }: MemberAvatarProps) {
  const classes = VARIANT_CLASSES[variant]
  const showPhoto = Boolean(photoUrl)

  return (
    <Avatar className={classes.root} aria-hidden="true">
      {showPhoto ? (
        <AvatarImage
          src={photoUrl}
          alt=""
          className="object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : null}
      <AvatarFallback className={classes.fallback} aria-hidden="true">
        {memberInitials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
