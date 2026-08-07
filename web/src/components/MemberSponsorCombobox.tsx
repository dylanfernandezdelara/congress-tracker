import { useEffect, useId, useRef, useState } from 'react'

import { fetchMembersSearch } from '../api/client'
import {
  getCachedMemberProfile,
  loadMemberProfile,
  prefetchMemberProfile,
} from '../api/memberProfileCache'
import type { MemberSearchItem } from '../api/types'

type MemberSponsorComboboxProps = {
  sponsor: string | null
  sponsorQ: string
  chamber: 'House' | 'Senate' | null
  state: string | null
  onPick: (next: { bioguideId: string; name: string } | null) => void
  onNameQuery: (next: string) => void
}

const MEMBER_SEARCH_DEBOUNCE_MS = 220

export function MemberSponsorCombobox({
  sponsor,
  sponsorQ,
  chamber,
  state,
  onPick,
  onNameQuery,
}: MemberSponsorComboboxProps) {
  const listboxId = useId()
  const inputId = useId()
  const focusedRef = useRef(false)
  const blurTimerRef = useRef<number | null>(null)
  const [memberDraft, setMemberDraft] = useState(() => {
    if (sponsor) return getCachedMemberProfile(sponsor)?.name ?? sponsorQ
    return sponsorQ
  })
  const [suggestions, setSuggestions] = useState<MemberSearchItem[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    if (focusedRef.current) return
    if (!sponsor) {
      setMemberDraft(sponsorQ)
      return
    }
    const cached = getCachedMemberProfile(sponsor)
    if (cached) {
      setMemberDraft(cached.name)
      return
    }
    let cancelled = false
    void loadMemberProfile(sponsor)
      .then((profile) => {
        if (!cancelled && !focusedRef.current) setMemberDraft(profile.name)
      })
      .catch(() => {
        if (!cancelled && !focusedRef.current) setMemberDraft(sponsor)
      })
    return () => {
      cancelled = true
    }
  }, [sponsor, sponsorQ])

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

  const commitDraft = () => {
    const next = memberDraft.trim()
    if (sponsor) {
      const selectedName = getCachedMemberProfile(sponsor)?.name
      if (selectedName && next === selectedName) return
      if (next === sponsor) return
    }
    if (!next) {
      onPick(null)
      return
    }
    onNameQuery(next)
  }

  return (
    <div className="feed-filter-field feed-filter-field--member">
      <label className="feed-filter-field-label" htmlFor={inputId}>
        Member
      </label>
      <div className="feed-member-combobox">
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
            if (sponsor) onPick(null)
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
                prefetchMemberProfile(pick.bioguide_id)
                onPick({ bioguideId: pick.bioguide_id, name: pick.name })
                setMemberDraft(pick.name)
                setSuggestOpen(false)
                return
              }
              commitDraft()
              setSuggestOpen(false)
              return
            }
            if (event.key === 'Escape') {
              if (suggestOpen) {
                event.preventDefault()
                setSuggestOpen(false)
                return
              }
              if (memberDraft) {
                event.preventDefault()
                setMemberDraft('')
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
              onPick(null)
            }}
          >
            ×
          </button>
        ) : null}
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
                    prefetchMemberProfile(item.bioguide_id)
                    onPick({ bioguideId: item.bioguide_id, name: item.name })
                    setMemberDraft(item.name)
                    setSuggestOpen(false)
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
