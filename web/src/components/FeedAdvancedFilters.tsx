import { useEffect, useId, useState } from 'react'

import { parseFeedPartyParam } from '@congress-tracker/shared/feed-filter-params'
import { US_STATE_OPTIONS } from '@congress-tracker/shared/us-states'

import { fetchPolicyAreas } from '../api/client'
import { useMemberProfile } from '../hooks/useMemberProfile'
import {
  advancedFilterCount,
  advancedFilterSummary,
  type AdvancedFeedFilters,
} from '../utils/feedAdvancedFilters'
import { MemberSponsorCombobox } from './MemberSponsorCombobox'

type FeedAdvancedFiltersProps = {
  filters: AdvancedFeedFilters
  onChange: (patch: Partial<AdvancedFeedFilters>) => void
  onClear: () => void
}

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

export function FeedAdvancedFilters({ filters, onChange, onClear }: FeedAdvancedFiltersProps) {
  const panelId = useId()
  const [open, setOpen] = useState(() => advancedFilterCount(filters) > 0)
  const [policyAreas, setPolicyAreas] = useState<string[]>([])

  const activeCount = advancedFilterCount(filters)
  const { profile: sponsorProfile } = useMemberProfile(filters.sponsor)
  const summary = advancedFilterSummary(filters, sponsorProfile?.name ?? null)

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

  return (
    <div className={`feed-advanced-filters${open ? ' is-open' : ''}${activeCount ? ' is-active' : ''}`}>
      <div className="feed-advanced-filters-bar">
        <button
          type="button"
          className="feed-advanced-filters-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((prev) => !prev)}
        >
          Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
        </button>
        {!open && summary.length > 0 ? (
          <p className="feed-advanced-filters-summary" title={summary.join(' · ')}>
            {summary.join(' · ')}
          </p>
        ) : null}
        {activeCount > 0 ? (
          <button type="button" className="feed-advanced-filters-clear" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="feed-advanced-filters-panel" id={panelId}>
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
        </div>
      ) : null}
    </div>
  )
}
