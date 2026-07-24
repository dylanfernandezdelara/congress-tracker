import type { ChamberFilter, ChamberFilterOption } from '../utils/chamberFilter'

type ChamberFilterControlProps = {
  value: ChamberFilter | null
  onChange: (next: ChamberFilter | null) => void
}

const OPTIONS: ChamberFilterOption[] = ['All', 'House', 'Senate']

export function ChamberFilterControl({ value, onChange }: ChamberFilterControlProps) {
  const selected: ChamberFilterOption = value ?? 'All'

  return (
    <div className="chamber-filter" role="radiogroup" aria-label="Filter by chamber">
      {OPTIONS.map((option) => {
        const checked = selected === option
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={checked}
            className={`chamber-filter-option${checked ? ' is-selected' : ''}`}
            onClick={() => onChange(option === 'All' ? null : option)}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
