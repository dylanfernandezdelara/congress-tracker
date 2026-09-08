import { normalizePartyCode, partyDisplayName, type PartyCode } from '@congress-tracker/shared/party'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const PARTY_CLASSES: Record<PartyCode, string> = {
  D: 'bg-party-d/15 text-party-d',
  R: 'bg-party-r/15 text-party-r',
  I: 'bg-party-i/15 text-party-i',
  Other: 'bg-party-other/15 text-party-other',
}

type PartyBadgeProps = {
  party: string
  className?: string
}

export function PartyBadge({ party, className }: PartyBadgeProps) {
  const code = normalizePartyCode(party)
  return (
    <Badge variant="outline" className={cn('border-transparent', PARTY_CLASSES[code], className)}>
      {partyDisplayName(party)}
    </Badge>
  )
}
