import type { ChamberFilter, ChamberFilterOption } from '../utils/chamberFilter'
import { SegmentedControl, SegmentedControlItem } from './dfdl/segmented-control'

type ChamberFilterControlProps = {
  value: ChamberFilter | null
  onChange: (next: ChamberFilter | null) => void
}

const OPTIONS: ChamberFilterOption[] = ['All', 'House', 'Senate']

export function ChamberFilterControl({ value, onChange }: ChamberFilterControlProps) {
  return (
    <SegmentedControl
      variant="underline"
      aria-label="Filter by chamber"
      value={value ?? 'All'}
      onValueChange={(next) => onChange(next === 'All' ? null : (next as ChamberFilter))}
    >
      {OPTIONS.map((option) => (
        <SegmentedControlItem key={option} value={option}>
          {option}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}
