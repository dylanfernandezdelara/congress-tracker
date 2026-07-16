import type { ExecutiveBillRole } from '@congress-tracker/shared/executive-api-types'
import { trimDisplayTitle } from '@congress-tracker/shared/feed-content'

import { formatShortBillId } from './billLabels'

export type BillDisplayRef = {
  congress: number
  type: string
  number: number
  title?: string | null
  headline?: string | null
}

/** Plain-language bill label for executive context (headline → short title → bill id). */
export function getBillColloquialName(bill: BillDisplayRef): string {
  if (bill.headline?.trim()) return trimDisplayTitle(bill.headline)
  if (bill.title?.trim()) return trimDisplayTitle(bill.title)
  return formatShortBillId(bill.type, bill.number)
}

export function formatExecutiveRoleLabel(role: ExecutiveBillRole): string {
  switch (role) {
    case 'primary':
      return 'About this bill'
    case 'conditional':
      return 'Must pass first'
    case 'related':
      return 'Related bill'
    case 'mentioned':
      return 'Also mentioned'
    default: {
      const _exhaustive: never = role
      return _exhaustive
    }
  }
}
