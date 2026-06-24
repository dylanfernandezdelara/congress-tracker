import { formatBillIdParts } from '../utils/billLabels'

type BillIdChipProps = {
  type: string
  number: number
  className?: string
}

export function BillIdChip({ type, number, className = 'feed-row-chip feed-row-chip--bill' }: BillIdChipProps) {
  const { prefix, number: billNumber, tooltip } = formatBillIdParts(type, number)
  const accessibleLabel = tooltip ? `${tooltip} ${billNumber}` : `${prefix} ${billNumber}`

  return (
    <span className={className} aria-label={accessibleLabel} title={tooltip}>
      {tooltip ? (
        <abbr title={tooltip} className="feed-row-bill-prefix">
          {prefix}
        </abbr>
      ) : (
        prefix
      )}{' '}
      {billNumber}
    </span>
  )
}
