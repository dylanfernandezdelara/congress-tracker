import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Typeahead } from '@astryxdesign/core/Typeahead'
import type { SearchSource, SearchableItem } from '@astryxdesign/core/Typeahead'

import { fetchMembersSearch } from '../api/client'
import { prefetchMemberProfile } from '../api/memberProfileCache'
import type { MemberSearchItem } from '../api/types'
import { readableMemberName } from '../utils/sponsorLabels'

export type MemberSponsorCommit = {
  sponsor: string | null
  sponsorQ: string
}

export type MemberSponsorComboboxHandle = {
  /** Kept for the filter panel's close path; picking commits at once, so there is no draft to flush. */
  flush: () => void
}

type MemberSponsorComboboxProps = {
  sponsor: string | null
  /** Name substring from an older link (`sponsor_q=`); the picker itself only selects one member. */
  sponsorQ: string
  /** Resolved display name for the selected sponsor (from useMemberProfile). */
  selectedName?: string | null
  chamber: 'House' | 'Senate' | null
  state: string | null
  /** Unused since the Astryx Typeahead positions its own menu; kept so callers don't change. */
  suggestionsInline?: boolean
  onCommit: (next: MemberSponsorCommit) => void
}

type MemberOption = SearchableItem<MemberSearchItem>

function memberMeta(item: MemberSearchItem): string {
  const seat = item.district != null ? `${item.state}-${item.district}` : item.state
  return [item.party, seat].filter(Boolean).join('-') + ` · ${item.chamber}`
}

function toOption(item: MemberSearchItem): MemberOption {
  const { name } = readableMemberName(item.name)
  return { id: item.bioguide_id, label: name ?? item.name, auxiliaryData: item }
}

/**
 * Pick one member to filter bills by primary sponsor. Built on Astryx's Typeahead,
 * which owns the listbox, keyboard navigation, debounce and screen-reader wiring.
 */
export const MemberSponsorCombobox = forwardRef<
  MemberSponsorComboboxHandle,
  MemberSponsorComboboxProps
>(function MemberSponsorCombobox(
  { sponsor, sponsorQ, selectedName = null, chamber, state, onCommit },
  ref,
) {
  useImperativeHandle(ref, () => ({ flush: () => {} }), [])

  /** Name from the most recent pick, until the parent's resolved name catches up. */
  const [pickedName, setPickedName] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const menuOpenRef = useRef(false)
  /** Whether the suggestion menu was open when this Escape started (the Typeahead closes it before we see it bubble). */
  const escapeClosesMenuRef = useRef(false)

  const searchSource = useMemo<SearchSource<MemberOption>>(
    () => ({
      async search(query) {
        const q = query.trim()
        if (q.length < 2) return []
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        try {
          const res = await fetchMembersSearch({
            q,
            chamber: chamber ?? undefined,
            state: state ?? undefined,
            limit: 8,
          })
          if (controller.signal.aborted) return []
          return res.items.map(toOption)
        } catch {
          return []
        }
      },
      bootstrap: () => [],
      cancel: () => controllerRef.current?.abort(),
    }),
    [chamber, state],
  )

  const value: MemberOption | null = sponsor
    ? { id: sponsor, label: readableMemberName(selectedName ?? pickedName ?? sponsor).name ?? sponsor }
    : null

  return (
    <div
      className="feed-filter-field feed-filter-field--member"
      onKeyDownCapture={(event) => {
        escapeClosesMenuRef.current = event.key === 'Escape' && menuOpenRef.current
      }}
      onKeyDown={(event) => {
        // Escape closes the suggestions only; the filter sheet stays open for the next pick.
        if (event.key === 'Escape' && escapeClosesMenuRef.current) {
          event.stopPropagation()
          event.nativeEvent.stopImmediatePropagation()
        }
      }}
    >
      <Typeahead<MemberOption>
        onOpenChange={(open) => {
          menuOpenRef.current = open
        }}
        label="Member"
        placeholder="Name or last name"
        searchSource={searchSource}
        value={value}
        minQueryLength={2}
        debounceMs={220}
        emptySearchText="No members match"
        width="100%"
        size="sm"
        onChange={(item) => {
          if (item) {
            setPickedName(item.label)
            prefetchMemberProfile(item.id)
            onCommit({ sponsor: item.id, sponsorQ: '' })
          } else {
            setPickedName(null)
            onCommit({ sponsor: null, sponsorQ: '' })
          }
        }}
        renderItem={(item) => (
          <span className="feed-member-suggestion">
            <span className="feed-member-suggestion-name">{item.label}</span>
            {item.auxiliaryData ? (
              <span className="feed-member-suggestion-meta">{memberMeta(item.auxiliaryData)}</span>
            ) : null}
          </span>
        )}
      />
      {!sponsor && sponsorQ ? (
        <p className="feed-filter-field-note">
          Sponsor name contains &ldquo;{sponsorQ}&rdquo;{' '}
          <button
            type="button"
            className="congress-link"
            onClick={() => onCommit({ sponsor: null, sponsorQ: '' })}
          >
            Clear
          </button>
        </p>
      ) : null}
    </div>
  )
})
