import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'

import type { ChamberFilter, ChamberFilterOption } from '../utils/chamberFilter'

type ChamberFilterControlProps = {
  value: ChamberFilter | null
  onChange: (next: ChamberFilter | null) => void
}

const OPTIONS: ChamberFilterOption[] = ['All', 'House', 'Senate']

export function ChamberFilterControl({ value, onChange }: ChamberFilterControlProps) {
  return (
    <SegmentedControl
      label="Filter by chamber"
      size="sm"
      value={value ?? 'All'}
      onChange={(next) => onChange(next === 'All' ? null : (next as ChamberFilter))}
    >
      {OPTIONS.map((option) => (
        <SegmentedControlItem key={option} value={option} label={option} />
      ))}
    </SegmentedControl>
  )
}
