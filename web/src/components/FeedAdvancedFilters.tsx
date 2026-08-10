import { useEffect, useId, useState, type ReactNode } from 'react'

import { parseFeedPartyParam } from '@congress-tracker/shared/feed-filter-params'
import { US_STATE_OPTIONS } from '@congress-tracker/shared/us-states'

import { fetchPolicyAreas } from '../api/client'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useMemberProfile } from '../hooks/useMemberProfile'
import {
  advancedFilterChips,
  advancedFilterCount,
  type AdvancedFeedFilters,
} from '../utils/feedAdvancedFilters'
import { AnimatedSheet } from './AnimatedSheet'
import { MemberSponsorCombobox } from './MemberSponsorCombobox'

type FeedAdvancedFiltersProps = {
  filters: AdvancedFeedFilters
  onChange: (patch: Partial<AdvancedFeedFilters>) => void
  onClear: () => void
  leading?: ReactNode
  trailing?: ReactNode
}

const FILTERS_INLINE_QUERY = '(min-width: 640px)'

const SPONSOR_CHAMBER_OPTIONS: Array<{
  value: '' | NonNullable<AdvancedFeedFilters['sponsorChamber']>
  label: string
}> = [
  { value: '', label: 'Any' },
  { value: 'House', label: 'House' },
  { value: 'Senate', label: 'Senate' },
]

const PARTY_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'D', label: 'Democrat' },
  { value: 'R', label: 'Republican' },
  { value: 'I', label: 'Independent' },
] as const

type FilterFieldsProps = {
  filters: AdvancedFeedFilters
  onChange: (patch: Partial<AdvancedFeedFilters>) => void
  policyAreas: string[]
  suggestionsInline?: boolean
}

function FilterFields({
  filters,
  onChange,
  policyAreas,
  suggestionsInline = false,
}: FilterFieldsProps) {
  return (
    <>
      <label className="feed-filter-field">
        <span className="feed-filter-field-label">State</span>
        <select
          className="feed-filter-select"
          aria-label="Filter by sponsor state"
          value={filters.state ?? ''}
          onChange={(event) => {
            const next = event.target.value
            onChange({ state: next === '' ? null : next })
          }}
        >
          <option value="">Any state</option>
          {US_STATE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="feed-filter-field feed-filter-field--segment">
        <legend className="feed-filter-field-label">Proposed by</legend>
        <div className="feed-filter-segment" role="radiogroup" aria-label="Sponsor chamber">
          {SPONSOR_CHAMBER_OPTIONS.map((option) => {
            const checked = (filters.sponsorChamber ?? '') === option.value
            return (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={checked}
                className={`feed-filter-segment-option${checked ? ' is-selected' : ''}`}
                onClick={() =>
                  onChange({
                    sponsorChamber: option.value === '' ? null : option.value,
                  })
                }
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="feed-filter-field">
        <span className="feed-filter-field-label">Party</span>
        <select
          className="feed-filter-select"
          aria-label="Filter by sponsor party"
          value={filters.party ?? ''}
          onChange={(event) => {
            onChange({ party: parseFeedPartyParam(event.target.value) })
          }}
        >
          {PARTY_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <MemberSponsorCombobox
        sponsor={filters.sponsor}
        sponsorQ={filters.sponsorQ}
        chamber={filters.sponsorChamber}
        state={filters.state}
        suggestionsInline={suggestionsInline}
        onPick={(next) => {
          if (!next) {
            onChange({ sponsor: null, sponsorQ: '' })
            return
          }
          onChange({ sponsor: next.bioguideId, sponsorQ: '' })
        }}
        onNameQuery={(next) => {
          onChange({ sponsor: null, sponsorQ: next.trim() })
        }}
      />

      <label className="feed-filter-field">
        <span className="feed-filter-field-label">Topic</span>
        <select
          className="feed-filter-select"
          aria-label="Filter by policy topic"
          value={filters.policy ?? ''}
          onChange={(event) => {
            const next = event.target.value
            onChange({ policy: next === '' ? null : next })
          }}
        >
          <option value="">Any topic</option>
          {filters.policy && !policyAreas.includes(filters.policy) ? (
            <option value={filters.policy}>{filters.policy}</option>
          ) : null}
          {policyAreas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}

export function FeedAdvancedFilters({
  filters,
  onChange,
  onClear,
  leading,
  trailing,
}: FeedAdvancedFiltersProps) {
  const panelId = useId()
  const sheetTitleId = useId()
  const inlinePanel = useMediaQuery(FILTERS_INLINE_QUERY)
  const [open, setOpen] = useState(false)
  const [sheetKey, setSheetKey] = useState(0)
  const [policyAreas, setPolicyAreas] = useState<string[]>([])

  const activeCount = advancedFilterCount(filters)
  const { profile: sponsorProfile } = useMemberProfile(filters.sponsor)
  const chips = advancedFilterChips(filters, sponsorProfile?.name ?? null)

  useEffect(() => {
    let cancelled = false
    void fetchPolicyAreas()
      .then((res) => {
        if (!cancelled) setPolicyAreas(res.items)
      })
      .catch(() => {
        if (!cancelled) setPolicyAreas([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openFilters = () => {
    setSheetKey((key) => key + 1)
    setOpen(true)
  }

  const closeFilters = () => {
    setOpen(false)
  }

  const toggleFilters = () => {
    if (open) closeFilters()
    else openFilters()
  }

  const fields = (
    <FilterFields
      filters={filters}
      onChange={onChange}
      policyAreas={policyAreas}
      suggestionsInline={!inlinePanel}
    />
  )

  return (
    <div
      className={`feed-advanced-filters${open ? ' is-open' : ''}${activeCount ? ' is-active' : ''}`}
    >
      <div className="feed-advanced-filters-primary">
        {leading}
        <div className="feed-advanced-filters-actions">
          <button
            type="button"
            className="feed-advanced-filters-toggle"
            aria-expanded={open}
            aria-controls={inlinePanel ? panelId : undefined}
            aria-haspopup={inlinePanel ? undefined : 'dialog'}
            onClick={toggleFilters}
          >
            Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
          </button>
          {activeCount > 0 ? (
            <button type="button" className="feed-advanced-filters-clear" onClick={onClear}>
              Clear
            </button>
          ) : null}
        </div>
        {trailing}
      </div>

      {chips.length > 0 ? (
        <ul className="feed-filter-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.id}>
              <button
                type="button"
                className="feed-filter-chip"
                onClick={() => onChange(chip.clear)}
                aria-label={`Remove ${chip.label} filter`}
              >
                <span className="feed-filter-chip-label">{chip.label}</span>
                <span className="feed-filter-chip-remove" aria-hidden="true">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {inlinePanel && open ? (
        <div className="feed-advanced-filters-panel" id={panelId}>
          {fields}
        </div>
      ) : null}

      {!inlinePanel ? (
        <AnimatedSheet
          open={open}
          selectionKey={sheetKey}
          onClose={closeFilters}
          titleId={sheetTitleId}
          closeAriaLabel="Close filters"
          closeLabel="Done"
          panelClassName="feed-filters-sheet"
        >
          <header className="feed-filters-sheet-header">
            <h2 id={sheetTitleId} className="feed-filters-sheet-title">
              Filters
            </h2>
            {activeCount > 0 ? (
              <button
                type="button"
                className="feed-advanced-filters-clear"
                onClick={onClear}
              >
                Clear all
              </button>
            ) : null}
          </header>
          <div className="feed-filters-sheet-fields">{fields}</div>
        </AnimatedSheet>
      ) : null}
    </div>
  )
}
