import type { ExecutiveBillRole } from '@congress-tracker/shared/executive-api-types'

export type { BillDisplayRef } from './billLabels'
export { getBillColloquialName } from './billLabels'

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
