import { useEffect, useId, useRef, useState } from 'react'

import { fetchMembersSearch } from '../api/client'
import { prefetchMemberProfile } from '../api/memberProfileCache'
import type { MemberSearchItem } from '../api/types'

type MemberSponsorComboboxProps = {
  sponsor: string | null
  sponsorQ: string
  /** Resolved display name for the selected sponsor (from useMemberProfile). */
  selectedName?: string | null
  chamber: 'House' | 'Senate' | null
  state: string | null
  /** Stack suggestions in document flow (e.g. inside a scrollable sheet). */
  suggestionsInline?: boolean
  onPick: (next: { bioguideId: string; name: string } | null) => void
  onNameQuery: (next: string) => void
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

export function MemberSponsorCombobox({
  sponsor,
  sponsorQ,
  selectedName = null,
  chamber,
  state,
  suggestionsInline = false,
  onPick,
  onNameQuery,
}: MemberSponsorComboboxProps) {
  const listboxId = useId()
  const inputId = useId()
  const focusedRef = useRef(false)
  const blurTimerRef = useRef<number | null>(null)
  /** Name from the most recent pick, until parent selectedName catches up. */
  const [pickedName, setPickedName] = useState<string | null>(null)
  const [memberDraft, setMemberDraft] = useState(() =>
    displayValue(sponsor, sponsorQ, selectedName, null),
  )
  const [suggestions, setSuggestions] = useState<MemberSearchItem[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    if (sponsor && selectedName?.trim() && pickedName && selectedName.trim() === pickedName) {
      setPickedName(null)
    }
    if (focusedRef.current) return
    setMemberDraft(displayValue(sponsor, sponsorQ, selectedName, pickedName))
  }, [sponsor, sponsorQ, selectedName, pickedName])

  useEffect(() => {
    if (sponsor) {
      setSuggestions([])
      return
    }
    const q = memberDraft.trim()
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
  }, [memberDraft, sponsor, chamber, state])

  useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current)
    }
  }, [])

  const resolvedLabel = selectedName?.trim() || pickedName || (sponsor ? sponsor : '')

  const commitDraft = () => {
    const next = memberDraft.trim()
    if (sponsor) {
      if (!next) {
        // Keep an exact sponsor selection while the display name is still resolving.
        if (!selectedName?.trim() && !pickedName) {
          setMemberDraft(sponsor)
          return
        }
        setPickedName(null)
        onPick(null)
        return
      }
      if (next === resolvedLabel || next === sponsor) return
    }
    if (!next) {
      setPickedName(null)
      onPick(null)
      return
    }
    setPickedName(null)
    onNameQuery(next)
  }

  const pickMember = (item: { bioguideId: string; name: string }) => {
    setPickedName(item.name)
    prefetchMemberProfile(item.bioguideId)
    onPick(item)
    setMemberDraft(item.name)
    setSuggestOpen(false)
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
              const value = event.target.value
              setMemberDraft(value)
              setSuggestOpen(true)
              if (sponsor) {
                setPickedName(null)
                onPick(null)
              }
            }}
            onFocus={() => {
              focusedRef.current = true
              setSuggestOpen(true)
            }}
            onBlur={() => {
              focusedRef.current = false
              blurTimerRef.current = window.setTimeout(() => {
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
                  setMemberDraft('')
                  setPickedName(null)
                  onPick(null)
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
              onClick={() => {
                setMemberDraft('')
                setSuggestions([])
                setPickedName(null)
                onPick(null)
              }}
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
}
