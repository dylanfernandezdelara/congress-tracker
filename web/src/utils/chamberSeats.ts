import type { PartySeatCount } from '../api/types'
import type { PartyCode } from '@congress-tracker/shared/party'
import { normalizePartyCode } from '@congress-tracker/shared/party'

const PARTY_SEAT_ORDER: PartyCode[] = ['D', 'I', 'R', 'Other']

export function sortPartySeatCounts(seats: PartySeatCount[]): PartySeatCount[] {
  const order = new Map(PARTY_SEAT_ORDER.map((party, index) => [party, index]))
  return [...seats].sort((a, b) => {
    const ai = order.get(normalizePartyCode(a.party)) ?? 99
    const bi = order.get(normalizePartyCode(b.party)) ?? 99
    return ai - bi
  })
}
