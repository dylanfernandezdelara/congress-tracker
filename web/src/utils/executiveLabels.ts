import type { ExecutiveBillRole } from '@congress-tracker/shared/executive-api-types'
import { formatBillDocket } from './billLabels'

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

export function formatExecutiveRoleDetail(role: ExecutiveBillRole): string {
  switch (role) {
    case 'primary':
      return 'Primary subject of the post'
    case 'conditional':
      return 'Action on this bill depends on this bill passing'
    case 'related':
      return 'Related in the same post'
    case 'mentioned':
      return 'Named in the same post'
    default: {
      const _exhaustive: never = role
      return _exhaustive
    }
  }
}

export function formatRelatedExecutiveBillLine(bill: {
  congress: number
  type: string
  number: number
  title?: string | null
  role: ExecutiveBillRole
}): string {
  const label = formatBillDocket(bill.type, bill.number, bill.congress)
  const title = bill.title ? ` (${bill.title})` : ''
  return `${label}${title} · ${formatExecutiveRoleLabel(bill.role)}`
}
