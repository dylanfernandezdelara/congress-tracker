import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { fetchMembersSearch } from '../api/client'
import { prefetchMemberProfile } from '../api/memberProfileCache'
import type { MemberSearchItem } from '../api/types'

export type MemberSponsorCommit = {
  sponsor: string | null
  sponsorQ: string
}

export type MemberSponsorComboboxHandle = {
  /** Flush the local draft into the parent filter (blur / panel close). */
  flush: () => void
}

type MemberSponsorComboboxProps = {
  sponsor: string | null
  sponsorQ: string
  /** Resolved display name for the selected sponsor (from useMemberProfile). */
  selectedName?: string | null
  chamber: 'House' | 'Senate' | null
  state: string | null
  /** Stack suggestions in document flow (e.g. inside a scrollable sheet). */
  suggestionsInline?: boolean
  onCommit: (next: MemberSponsorCommit) => void
}

const MEMBER_SEARCH_DEBOUNCE_MS = 220

function displayValue(
  sponsor: string | null,
  sponsorQ: string,
  selectedName: string | null | undefined,
  pickedName: string | null,
): string {
  if (!sponsor) return sponsorQ
  return selectedName?.trim() || pickedName || sponsor
}

export const MemberSponsorCombobox = forwardRef<
  MemberSponsorComboboxHandle,
  MemberSponsorComboboxProps
>(function MemberSponsorCombobox(
  {
    sponsor,
    sponsorQ,
    selectedName = null,
    chamber,
    state,
    suggestionsInline = false,
    onCommit,
  },
  ref,
) {
  const listboxId = useId()
  const inputId = useId()
  const focusedRef = useRef(false)
  const blurTimerRef = useRef<number | null>(null)
  const draftRef = useRef('')
  /** Name from the most recent pick, until parent selectedName catches up. */
  const [pickedName, setPickedName] = useState<string | null>(null)
  const [memberDraft, setMemberDraft] = useState(() =>
    displayValue(sponsor, sponsorQ, selectedName, null),
  )
  const [suggestions, setSuggestions] = useState<MemberSearchItem[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  draftRef.current = memberDraft

  const resolvedLabel = selectedName?.trim() || pickedName || (sponsor ? sponsor : '')

  useEffect(() => {
    if (sponsor && selectedName?.trim() && pickedName && selectedName.trim() === pickedName) {
      setPickedName(null)
    }
    if (focusedRef.current) return
    setMemberDraft(displayValue(sponsor, sponsorQ, selectedName, pickedName))
  }, [sponsor, sponsorQ, selectedName, pickedName])

  useEffect(() => {
    const q = memberDraft.trim()
    const editingAway =
      Boolean(sponsor) && q.length > 0 && q !== resolvedLabel && q !== sponsor
    if (sponsor && !editingAway) {
      setSuggestions([])
      return
    }
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      void fetchMembersSearch({
        q,
        chamber: chamber ?? undefined,
        state: state ?? undefined,
        limit: 8,
      })
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res.items)
            setActiveIndex(-1)
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
    }, MEMBER_SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [memberDraft, sponsor, chamber, state, resolvedLabel])

  const commitDraft = useCallback(() => {
    const next = draftRef.current.trim()
    const label = selectedName?.trim() || pickedName || ''
    if (sponsor) {
      if (!next) {
        // Keep an exact sponsor selection while the display name is still resolving.
        if (!label) {
          setMemberDraft(sponsor)
          return
        }
        setPickedName(null)
        onCommit({ sponsor: null, sponsorQ: '' })
        return
      }
      if (next === label || next === sponsor) return
    }
    if (!next) {
      if (!sponsor && !sponsorQ) return
      setPickedName(null)
      onCommit({ sponsor: null, sponsorQ: '' })
      return
    }
    if (!sponsor && next === sponsorQ) return
    setPickedName(null)
    onCommit({ sponsor: null, sponsorQ: next })
  }, [onCommit, pickedName, selectedName, sponsor, sponsorQ])

  useImperativeHandle(ref, () => ({ flush: commitDraft }), [commitDraft])

  useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) {
        window.clearTimeout(blurTimerRef.current)
        blurTimerRef.current = null
      }
      // Panel/sheet unmount (Done / toggle close) must not drop a typed sponsor_q.
      if (focusedRef.current) commitDraft()
    }
  }, [commitDraft])

  const pickMember = (item: { bioguideId: string; name: string }) => {
    setPickedName(item.name)
    prefetchMemberProfile(item.bioguideId)
    onCommit({ sponsor: item.bioguideId, sponsorQ: '' })
    setMemberDraft(item.name)
    setSuggestOpen(false)
  }

  const clearMember = () => {
    setMemberDraft('')
    setSuggestions([])
    setPickedName(null)
    onCommit({ sponsor: null, sponsorQ: '' })
  }

  return (
    <div className="feed-filter-field feed-filter-field--member">
      <label className="feed-filter-field-label" htmlFor={inputId}>
        Member
      </label>
      <div
        className={`feed-member-combobox${suggestionsInline ? ' feed-member-combobox--inline' : ''}`}
      >
        <div className="feed-member-combobox-input-row">
          <input
            id={inputId}
            type="search"
            className="feed-filter-input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestOpen && suggestions.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
            placeholder="Name or last name"
            autoComplete="off"
            spellCheck={false}
            value={memberDraft}
            onChange={(event) => {
              setMemberDraft(event.target.value)
              setSuggestOpen(true)
            }}
            onFocus={() => {
              focusedRef.current = true
              setSuggestOpen(true)
            }}
            onBlur={() => {
              focusedRef.current = false
              blurTimerRef.current = window.setTimeout(() => {
                blurTimerRef.current = null
                setSuggestOpen(false)
                commitDraft()
              }, 120)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && suggestions.length > 0) {
                event.preventDefault()
                setSuggestOpen(true)
                setActiveIndex((idx) => Math.min(idx + 1, suggestions.length - 1))
                return
              }
              if (event.key === 'ArrowUp' && suggestions.length > 0) {
                event.preventDefault()
                setActiveIndex((idx) => Math.max(idx - 1, 0))
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                if (activeIndex >= 0 && suggestions[activeIndex]) {
                  const pick = suggestions[activeIndex]
                  pickMember({ bioguideId: pick.bioguide_id, name: pick.name })
                  return
                }
                commitDraft()
                setSuggestOpen(false)
                return
              }
              if (event.key === 'Escape') {
                if (suggestOpen && suggestions.length > 0) {
                  event.preventDefault()
                  event.stopPropagation()
                  setSuggestOpen(false)
                  return
                }
                if (memberDraft) {
                  event.preventDefault()
                  event.stopPropagation()
                  setSuggestOpen(false)
                  clearMember()
                }
              }
            }}
          />
          {memberDraft ? (
            <button
              type="button"
              className="feed-member-combobox-clear"
              aria-label="Clear member filter"
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearMember}
            >
              ×
            </button>
          ) : null}
        </div>
        {suggestOpen && suggestions.length > 0 ? (
          <ul className="feed-member-suggestions" id={listboxId} role="listbox">
            {suggestions.map((item, index) => (
              <li key={item.bioguide_id} role="presentation">
                <button
                  type="button"
                  role="option"
                  id={`${listboxId}-${index}`}
                  aria-selected={index === activeIndex}
                  className={`feed-member-suggestion${index === activeIndex ? ' is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    pickMember({ bioguideId: item.bioguide_id, name: item.name })
                  }}
                >
                  <span className="feed-member-suggestion-name">{item.name}</span>
                  <span className="feed-member-suggestion-meta">
                    {item.chamber} · {item.party}
                    {item.state ? ` · ${item.state}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
})
