import { SlidersHorizontal } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'

import { Button } from '@astryxdesign/core/Button'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { Token } from '@astryxdesign/core/Token'
import { parseFeedPartyParam } from '@congress-tracker/shared/feed-filter-params'
import { US_STATE_OPTIONS } from '@congress-tracker/shared/us-states'

import { fetchPolicyAreas } from '../api/client'
import { useMediaQuery } from '../hooks/useMediaQuery'
import {
  advancedFilterChips,
  advancedFilterCount,
  type AdvancedFeedFilters,
} from '../utils/feedAdvancedFilters'
import { AnimatedSheet } from './AnimatedSheet'
import { Collapsible, CollapsibleContent } from './dfdl/collapsible'
import {
  MemberSponsorCombobox,
  type MemberSponsorComboboxHandle,
  type MemberSponsorCommit,
} from './MemberSponsorCombobox'

type FeedAdvancedFiltersProps = {
  filters: AdvancedFeedFilters
  sponsorName?: string | null
  onChange: (patch: Partial<AdvancedFeedFilters>) => void
  onClear: () => void
  /** Home owns the primary toolbar row; this injects the Filters toggle/actions. */
  renderToolbar: (actions: ReactNode) => ReactNode
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
  selectedSponsorName: string | null
  memberRef: Ref<MemberSponsorComboboxHandle>
  suggestionsInline?: boolean
}

function FilterFields({
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

  return (
    <>
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
    </>
  )
}

export function FeedAdvancedFilters({
  filters,
  sponsorName = null,
  onChange,
  onClear,
  renderToolbar,
}: FeedAdvancedFiltersProps) {
  const panelId = useId()
  const sheetTitleId = useId()
  const memberRef = useRef<MemberSponsorComboboxHandle | null>(null)
  const inlinePanel = useMediaQuery(FILTERS_INLINE_QUERY)
  const [open, setOpen] = useState(false)
  const [sheetKey, setSheetKey] = useState(0)
  const [policyAreas, setPolicyAreas] = useState<string[]>([])

  const activeCount = advancedFilterCount(filters)
  const chips = advancedFilterChips(filters, sponsorName)

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

  const flushMemberDraft = () => {
    memberRef.current?.flush()
  }

  const openFilters = () => {
    setSheetKey((key) => key + 1)
    setOpen(true)
  }

  const closeFilters = () => {
    flushMemberDraft()
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
      selectedSponsorName={sponsorName}
      memberRef={memberRef}
      suggestionsInline={!inlinePanel}
    />
  )

  const actions = (
    <div className="feed-advanced-filters-actions">
      <Button
        variant="ghost"
        size="sm"
        label={`Filters${activeCount > 0 ? ` · ${activeCount}` : ''}`}
        icon={<SlidersHorizontal aria-hidden="true" size={14} />}
        aria-expanded={open}
        aria-controls={inlinePanel ? panelId : undefined}
        aria-haspopup={inlinePanel ? undefined : 'dialog'}
        onClick={toggleFilters}
      />
      {activeCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          label="Clear"
          onClick={() => {
            flushMemberDraft()
            onClear()
          }}
        />
      ) : null}
    </div>
  )

  return (
    <div
      className={`feed-advanced-filters${open ? ' is-open' : ''}${activeCount ? ' is-active' : ''}`}
    >
      {renderToolbar(actions)}

      {chips.length > 0 ? (
        <ul className="feed-filter-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.id}>
              <Token
                size="sm"
                label={chip.label}
                onRemove={() => onChange(chip.clear)}
                description={`Remove ${chip.label} filter`}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {inlinePanel ? (
        <Collapsible open={open}>
          <CollapsibleContent expand id={panelId}>
            <div className="feed-advanced-filters-panel">{fields}</div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {!inlinePanel ? (
        <AnimatedSheet
          open={open}
          selectionKey={sheetKey}
          onClose={closeFilters}
          titleId={sheetTitleId}
          closeLabel="Done"
          footerDismiss
          panelClassName="feed-filters-sheet"
        >
          <header className="feed-filters-sheet-header">
            <h2 id={sheetTitleId} className="feed-filters-sheet-title">
              Filters
            </h2>
            {activeCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                label="Clear all"
                onClick={() => {
                  flushMemberDraft()
                  onClear()
                }}
              />
            ) : null}
          </header>
          <div className="feed-filters-sheet-fields">{fields}</div>
        </AnimatedSheet>
      ) : null}
    </div>
  )
}
