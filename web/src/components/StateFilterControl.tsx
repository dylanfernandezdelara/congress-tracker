import { US_STATE_OPTIONS } from '@congress-tracker/shared/us-states'

import type { StateFilter } from '../utils/stateFilter'

type StateFilterControlProps = {
  value: StateFilter | null
  onChange: (next: StateFilter | null) => void
}

export function StateFilterControl({ value, onChange }: StateFilterControlProps) {
  const active = value != null

  return (
    <div className={`state-filter${active ? ' is-active' : ''}`}>
      <select
        className="state-filter-select"
        aria-label="Filter by sponsor state"
        value={value ?? ''}
        onChange={(event) => {
          const next = event.target.value
          onChange(next === '' ? null : next)
        }}
      >
        <option value="">State</option>
        {US_STATE_OPTIONS.map((state) => (
          <option key={state.code} value={state.code}>
            {state.name}
          </option>
        ))}
      </select>
    </div>
  )
}
