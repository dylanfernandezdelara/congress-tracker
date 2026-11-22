import { SlidersHorizontal } from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { fetchPolicyAreas } from '../api/client'
import { useMediaQuery } from '../hooks/useMediaQuery'
import {
  advancedFilterChips,
  advancedFilterCount,
  type AdvancedFeedFilters,
} from '../utils/feedAdvancedFilters'
import { AnimatedSheet } from './AnimatedSheet'
import { Collapsible, CollapsibleContent } from './dfdl/collapsible'
import type { MemberSponsorComboboxHandle } from './MemberSponsorCombobox'

// Astryx and its stylesheet arrive with the panel, not with the page.
const loadFeedFilterFields = () => import('./FeedFilterFields')
const FeedFilterFields = lazy(loadFeedFilterFields)

/** Fetch the panel once the page is idle, so opening Filters on a slow phone doesn't wait on the download. */
function usePrefetchFilterFields() {
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback
    if (idle) {
      const handle = idle(() => void loadFeedFilterFields(), { timeout: 4000 })
      return () => window.cancelIdleCallback?.(handle)
    }
    const timer = window.setTimeout(() => void loadFeedFilterFields(), 2500)
    return () => window.clearTimeout(timer)
  }, [])
}

type FeedAdvancedFiltersProps = {
  filters: AdvancedFeedFilters
  sponsorName?: string | null
  onChange: (patch: Partial<AdvancedFeedFilters>) => void
  onClear: () => void
  /** Home owns the primary toolbar row; this injects the Filters toggle/actions. */
  renderToolbar: (actions: ReactNode) => ReactNode
}

const FILTERS_INLINE_QUERY = '(min-width: 640px)'

export function FeedAdvancedFilters({
  filters,
  sponsorName = null,
  onChange,
  onClear,
  renderToolbar,
}: FeedAdvancedFiltersProps) {
  usePrefetchFilterFields()
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
    <Suspense fallback={<p className="feed-filter-field-note">Loading filters…</p>}>
      <FeedFilterFields
      filters={filters}
      onChange={onChange}
      policyAreas={policyAreas}
      selectedSponsorName={sponsorName}
      memberRef={memberRef}
      suggestionsInline={!inlinePanel}
      />
    </Suspense>
  )

  const actions = (
    <div className="feed-advanced-filters-actions">
      <button
        type="button"
        className="feed-advanced-filters-toggle"
        aria-expanded={open}
        aria-controls={inlinePanel ? panelId : undefined}
        aria-haspopup={inlinePanel ? undefined : 'dialog'}
        onClick={toggleFilters}
      >
        <SlidersHorizontal aria-hidden="true" />
        Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
      </button>
      {activeCount > 0 ? (
        <button
          type="button"
          className="feed-advanced-filters-clear"
          onClick={() => {
            flushMemberDraft()
            onClear()
          }}
        >
          Clear
        </button>
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
              <button
                type="button"
                className="feed-advanced-filters-clear"
                onClick={() => {
                  flushMemberDraft()
                  onClear()
                }}
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
