import { useEffect, useId, useRef, useState } from 'react'

import { US_STATE_OPTIONS } from '@congress-tracker/shared/us-states'

import { fetchMembersSearch, fetchPolicyAreas } from '../api/client'
import type { MemberSearchItem } from '../api/types'
import { loadMemberProfile } from '../api/memberProfileCache'
import {
  advancedFilterCount,
  advancedFilterSummary,
  type PartyFilter,
  type SponsorChamberFilter,
} from '../utils/feedAdvancedFilters'
import type { StateFilter } from '../utils/stateFilter'

type FeedAdvancedFiltersProps = {
  state: StateFilter | null
  sponsorChamber: SponsorChamberFilter | null
  sponsor: string | null
  sponsorQ: string
  party: PartyFilter | null
  policy: string | null
  onStateChange: (next: StateFilter | null) => void
  onSponsorChamberChange: (next: SponsorChamberFilter | null) => void
  onPartyChange: (next: PartyFilter | null) => void
  onPolicyChange: (next: string | null) => void
  onSponsorMemberChange: (next: { bioguideId: string; name?: string } | null) => void
  onSponsorNameQueryChange: (next: string) => void
  onClearAll: () => void
}

const SPONSOR_CHAMBER_OPTIONS: Array<{ value: '' | SponsorChamberFilter; label: string }> = [
  { value: '', label: 'Any' },
  { value: 'House', label: 'House' },
  { value: 'Senate', label: 'Senate' },
]

const PARTY_OPTIONS: Array<{ value: '' | PartyFilter; label: string }> = [
  { value: '', label: 'Any' },
  { value: 'D', label: 'Democrat' },
  { value: 'R', label: 'Republican' },
  { value: 'I', label: 'Independent' },
]

const MEMBER_SEARCH_DEBOUNCE_MS = 220

export function FeedAdvancedFilters({
  state,
  sponsorChamber,
  sponsor,
  sponsorQ,
  party,
  policy,
  onStateChange,
  onSponsorChamberChange,
  onPartyChange,
  onPolicyChange,
  onSponsorMemberChange,
  onSponsorNameQueryChange,
  onClearAll,
}: FeedAdvancedFiltersProps) {
  const panelId = useId()
  const listboxId = useId()
  const [open, setOpen] = useState(
    () =>
      advancedFilterCount({
        state,
        sponsorChamber,
        sponsor,
        sponsorQ,
        party,
        policy,
      }) > 0,
  )
  const [policyAreas, setPolicyAreas] = useState<string[]>([])
  const [memberDraft, setMemberDraft] = useState(sponsorQ)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<MemberSearchItem[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const blurTimerRef = useRef<number | null>(null)

  const activeCount = advancedFilterCount({
    state,
    sponsorChamber,
    sponsor,
    sponsorQ,
    party,
    policy,
  })
  const summary = advancedFilterSummary(
    { state, sponsorChamber, sponsor, sponsorQ, party, policy },
    selectedName,
  )

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

  useEffect(() => {
    if (!sponsor) {
      setSelectedName(null)
      setMemberDraft(sponsorQ)
      return
    }
    let cancelled = false
    void loadMemberProfile(sponsor)
      .then((profile) => {
        if (cancelled) return
        setSelectedName(profile.name)
        setMemberDraft(profile.name)
      })
      .catch(() => {
        if (cancelled) return
        setSelectedName(sponsor)
        setMemberDraft(sponsor)
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
        chamber: sponsorChamber ?? undefined,
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
  }, [memberDraft, sponsor, sponsorChamber, state])

  useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current)
    }
  }, [])

  const commitMemberDraft = () => {
    const next = memberDraft.trim()
    if (sponsor && selectedName && next === selectedName) return
    if (!next) {
      onSponsorMemberChange(null)
      return
    }
    onSponsorNameQueryChange(next)
  }

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
          <button type="button" className="feed-advanced-filters-clear" onClick={onClearAll}>
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
              value={state ?? ''}
              onChange={(event) => {
                const next = event.target.value
                onStateChange(next === '' ? null : next)
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
                const checked = (sponsorChamber ?? '') === option.value
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    className={`feed-filter-segment-option${checked ? ' is-selected' : ''}`}
                    onClick={() =>
                      onSponsorChamberChange(option.value === '' ? null : option.value)
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
              value={party ?? ''}
              onChange={(event) => {
                const next = event.target.value
                onPartyChange(next === '' ? null : (next as PartyFilter))
              }}
            >
              {PARTY_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="feed-filter-field feed-filter-field--member">
            <label className="feed-filter-field-label" htmlFor={`${panelId}-member`}>
              Member
            </label>
            <div className="feed-member-combobox">
              <input
                id={`${panelId}-member`}
                type="search"
                className="feed-filter-input"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={suggestOpen && suggestions.length > 0}
                aria-controls={listboxId}
                aria-activedescendant={
                  activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
                }
                placeholder="Name or last name"
                autoComplete="off"
                spellCheck={false}
                value={memberDraft}
                onChange={(event) => {
                  setMemberDraft(event.target.value)
                  setSuggestOpen(true)
                  if (sponsor) onSponsorMemberChange(null)
                }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => {
                  blurTimerRef.current = window.setTimeout(() => {
                    setSuggestOpen(false)
                    commitMemberDraft()
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
                      onSponsorMemberChange({
                        bioguideId: pick.bioguide_id,
                        name: pick.name,
                      })
                      setSelectedName(pick.name)
                      setMemberDraft(pick.name)
                      setSuggestOpen(false)
                      return
                    }
                    commitMemberDraft()
                    setSuggestOpen(false)
                    return
                  }
                  if (event.key === 'Escape') {
                    setSuggestOpen(false)
                    if (memberDraft) {
                      setMemberDraft('')
                      onSponsorMemberChange(null)
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
                    onSponsorMemberChange(null)
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
                          onSponsorMemberChange({
                            bioguideId: item.bioguide_id,
                            name: item.name,
                          })
                          setSelectedName(item.name)
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

          <label className="feed-filter-field">
            <span className="feed-filter-field-label">Topic</span>
            <select
              className="feed-filter-select"
              aria-label="Filter by policy topic"
              value={policy ?? ''}
              onChange={(event) => {
                const next = event.target.value
                onPolicyChange(next === '' ? null : next)
              }}
            >
              <option value="">Any topic</option>
              {policy && !policyAreas.includes(policy) ? (
                <option value={policy}>{policy}</option>
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
