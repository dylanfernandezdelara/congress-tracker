import { memberInitials } from '../utils/memberPhoto'
import { Avatar } from '@/components/dfdl/avatar'

/* The app's two sizes sit outside dfdl's 24/32/40 scale: 20px beside a name in a vote list, 64px on a profile. */
const VARIANT_CLASSES = {
  defector: 'size-5',
  profile: 'size-16 text-heading',
} as const

type MemberAvatarProps = {
  name: string
  photoUrl: string
  /** Compact notable-vote avatar or the larger profile-sheet avatar. */
  variant: keyof typeof VARIANT_CLASSES
}

export function MemberAvatar({ name, photoUrl, variant }: MemberAvatarProps) {
  return (
    <Avatar
      size={variant === 'defector' ? 'sm' : 'lg'}
      className={VARIANT_CLASSES[variant]}
      src={photoUrl || undefined}
      alt=""
      fallback={memberInitials(name)}
      aria-hidden="true"
    />
  )
}
