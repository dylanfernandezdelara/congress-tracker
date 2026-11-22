/**
 * The filter panel's fields, on Astryx (meta/astryx): searchable state and topic pickers that become bottom sheets
 * on phones, a member Typeahead, and a segmented sponsor-chamber control. Loaded lazily with its CSS the first time
 * Filters opens, so the main page doesn't download the library.
 */
import '@astryxdesign/core/astryx.css'
import './../theme/trackcongress.css'

import { useCallback, type Ref } from 'react'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { Theme } from '@astryxdesign/core/theme'

import { parseFeedPartyParam } from '@congress-tracker/shared/feed-filter-params'
import { US_STATE_OPTIONS } from '@congress-tracker/shared/us-states'

import { useDocumentTheme } from '../hooks/useDocumentTheme'
import { trackcongressTheme } from '../theme/trackcongress'
import type { AdvancedFeedFilters } from '../utils/feedAdvancedFilters'
import {
  MemberSponsorCombobox,
  type MemberSponsorComboboxHandle,
  type MemberSponsorCommit,
} from './MemberSponsorCombobox'

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

export type FilterFieldsProps = {
  filters: AdvancedFeedFilters
  onChange: (patch: Partial<AdvancedFeedFilters>) => void
  policyAreas: string[]
  selectedSponsorName: string | null
  memberRef: Ref<MemberSponsorComboboxHandle>
  suggestionsInline?: boolean
}

export default function FeedFilterFields({
  filters,
  onChange,
  policyAreas,
  selectedSponsorName,
  memberRef,
  suggestionsInline = false,
}: FilterFieldsProps) {
  const onMemberCommit = useCallback(
    (next: MemberSponsorCommit) => {
      onChange(next)
    },
    [onChange],
  )

  const ANY = 'any'
  const topicOptions = [
    { value: ANY, label: 'Any topic' },
    ...(filters.policy && !policyAreas.includes(filters.policy) ? [{ value: filters.policy, label: filters.policy }] : []),
    ...policyAreas.map((area) => ({ value: area, label: area })),
  ]

  const mode = useDocumentTheme()

  return (
    <Theme theme={trackcongressTheme} mode={mode}>
      <div className="feed-filter-field">
        <Selector
          label="State"
          size="sm"
          width="100%"
          hasSearch
          searchPlaceholder="Search states"
          presentation="adaptive"
          options={[{ value: ANY, label: 'Any state' }, ...US_STATE_OPTIONS.map((o) => ({ value: o.code, label: o.name }))]}
          value={filters.state ?? ANY}
          onChange={(next) => onChange({ state: !next || next === ANY ? null : next })}
        />
      </div>

      <div className="feed-filter-field feed-filter-field--segment">
        <span className="feed-filter-field-label" aria-hidden="true">
          Proposed by
        </span>
        <SegmentedControl
          label="Sponsor chamber"
          size="sm"
          layout="fill"
          value={filters.sponsorChamber ?? ANY}
          onChange={(next) =>
            onChange({
              sponsorChamber: next === ANY ? null : (next as NonNullable<AdvancedFeedFilters['sponsorChamber']>),
            })
          }
        >
          {SPONSOR_CHAMBER_OPTIONS.map((option) => (
            <SegmentedControlItem key={option.label} value={option.value || ANY} label={option.label} />
          ))}
        </SegmentedControl>
      </div>

      <div className="feed-filter-field">
        <Selector
          label="Party"
          size="sm"
          width="100%"
          presentation="adaptive"
          options={PARTY_OPTIONS.map((o) => ({ value: o.value || ANY, label: o.label }))}
          value={filters.party ?? ANY}
          onChange={(next) => onChange({ party: parseFeedPartyParam(!next || next === ANY ? '' : next) })}
        />
      </div>

      <MemberSponsorCombobox
        ref={memberRef}
        sponsor={filters.sponsor}
        sponsorQ={filters.sponsorQ}
        selectedName={selectedSponsorName}
        chamber={filters.sponsorChamber}
        state={filters.state}
        suggestionsInline={suggestionsInline}
        onCommit={onMemberCommit}
      />

      <div className="feed-filter-field">
        <Selector
          label="Topic"
          size="sm"
          width="100%"
          hasSearch
          searchPlaceholder="Search topics"
          presentation="adaptive"
          options={topicOptions}
          value={filters.policy ?? ANY}
          onChange={(next) => onChange({ policy: !next || next === ANY ? null : next })}
        />
      </div>
    </Theme>
  )
}
