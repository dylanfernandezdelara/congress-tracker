import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import type { ElectionsIndexState } from '@congress-tracker/shared/elections-2026/api-types'
import { guideSections } from '@congress-tracker/shared/elections-2026/present'
import type { ElectionRace, StateElectionGuide } from '@congress-tracker/shared/elections-2026/types'

import { fetchElectionsIndex, fetchElectionsLocate, fetchStateGuide } from '../api/elections'
import { ElectionRaceCard } from '../components/ElectionRaceCard'
import { MemberProfileProvider } from '../components/MemberProfileProvider'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatVoteDate } from '../utils/billLabels'

const STATE_STORAGE_KEY = 'midterms_state'
const VOTE_GOV_URL = 'https://vote.gov/'

function readSavedState(): string | null {
  try {
    return localStorage.getItem(STATE_STORAGE_KEY)
  } catch {
    return null
  }
}

function saveState(code: string) {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, code)
  } catch {
    // Private mode or blocked storage: the URL still carries the state.
  }
}

function formatElectionDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.'
}

/** Resolve the state to show when the URL has none: saved choice, then IP guess. */
function useDefaultState(enabled: boolean) {
  const [result, setResult] = useState<{ code: string | null; fromLocation: boolean } | null>(null)

  useEffect(() => {
    if (!enabled) return
    const saved = readSavedState()
    if (saved) {
      setResult({ code: saved, fromLocation: false })
      return
    }
    let cancelled = false
    fetchElectionsLocate()
      .then(({ state }) => !cancelled && setResult({ code: state, fromLocation: state != null }))
      .catch(() => !cancelled && setResult({ code: null, fromLocation: false }))
    return () => {
      cancelled = true
    }
  }, [enabled])

  return result
}

function StatePicker({
  states,
  value,
  onChange,
}: {
  states: ElectionsIndexState[]
  value: string
  onChange: (code: string) => void
}) {
  return (
    <label className="midterms-picker">
      <span className="midterms-picker-label">State</span>
      <select
        className="midterms-picker-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {value === '' ? (
          <option value="" disabled>
            Pick your state
          </option>
        ) : null}
        {states.map((s) => (
          <option key={s.code} value={s.code}>
            {s.status === 'pending' ? `${s.name} (coming soon)` : s.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function RaceSection({ title, races }: { title: string; races: ElectionRace[] }) {
  if (races.length === 0) return null
  return (
    <section className="midterms-section" aria-label={title}>
      <h2 className="midterms-section-title">
        {title} <span className="midterms-section-count">{races.length}</span>
      </h2>
      <div className="midterms-race-list">
        {races.map((race) => (
          <ElectionRaceCard key={race.id} race={race} />
        ))}
      </div>
    </section>
  )
}

function OfficialLinks({ guide }: { guide: StateElectionGuide }) {
  return (
    <ul className="midterms-official">
      {guide.ballot_lookup_url ? (
        <li>
          <a href={guide.ballot_lookup_url} target="_blank" rel="noreferrer">
            Find your district and sample ballot
          </a>
        </li>
      ) : null}
      {guide.election_office ? (
        <li>
          <a href={guide.election_office.url} target="_blank" rel="noreferrer">
            {guide.election_office.name}
          </a>
        </li>
      ) : null}
    </ul>
  )
}

function StateGuide({ code, stateName }: { code: string; stateName: string }) {
  const { data: guide, error, isLoading } = useAsyncData({
    deps: [code],
    load: () => fetchStateGuide(code),
    mapError: errorMessage,
  })

  if (isLoading && !guide) return <p className="midterms-status">Loading {stateName}…</p>
  if (error) return <p className="midterms-status">{error}</p>
  if (!guide) return null

  if (guide.status === 'pending') {
    return (
      <p className="midterms-status">
        We’re still checking every candidate in {stateName} against official sources. Until then,{' '}
        <a href={VOTE_GOV_URL} target="_blank" rel="noreferrer">
          vote.gov
        </a>{' '}
        links to your state’s election office.
      </p>
    )
  }

  const sections = guideSections(guide)
  return (
    <>
      <OfficialLinks guide={guide} />
      <RaceSection title="Competitive races" races={sections.competitive} />
      <RaceSection title="Senate and governor" races={sections.statewide} />
      <RaceSection title="U.S. House" races={sections.house} />
      <p className="midterms-footnote">
        Candidates are listed alphabetically. “Competitive” means Sabato’s Crystal Ball rates the race
        Toss-up or Lean. Your ballot also has state and local races that aren’t listed here, and your
        state’s official sample ballot is the final word.
        {guide.updated ? ` Last checked against official sources ${formatVoteDate(guide.updated)}.` : ''}
      </p>
    </>
  )
}

export default function Midterms() {
  const { state: rawState } = useParams<{ state?: string }>()
  const navigate = useNavigate()
  const code = rawState?.toUpperCase() ?? null

  const { data: index, error: indexError } = useAsyncData({
    deps: [],
    load: fetchElectionsIndex,
    mapError: errorMessage,
  })
  const fallback = useDefaultState(code == null)
  const [fromLocation, setFromLocation] = useState(false)

  useEffect(() => {
    if (code != null || !fallback?.code) return
    setFromLocation(fallback.fromLocation)
    navigate(`/midterms/${fallback.code}`, { replace: true })
  }, [code, fallback, navigate])

  const chooseState = (next: string) => {
    saveState(next)
    setFromLocation(false)
    navigate(`/midterms/${next}`)
  }

  const current = index?.states.find((s) => s.code === code) ?? null

  return (
    <MemberProfileProvider>
      <main id="content" className="midterms">
        <header className="midterms-head">
          <h1 className="midterms-title">2026 midterm elections</h1>
          <p className="midterms-lede">
            {index ? `Election day is ${formatElectionDay(index.election_day)}. ` : ''}
            Every race for Congress and governor on your ballot, with the facts on each candidate.
            Members of Congress link to their voting record.
          </p>
        </header>

        {indexError ? <p className="midterms-status">{indexError}</p> : null}

        {index ? (
          <div className="midterms-picker-row">
            <StatePicker states={index.states} value={current?.code ?? ''} onChange={chooseState} />
            {current && fromLocation ? (
              <span className="midterms-picker-hint">Based on your location</span>
            ) : null}
          </div>
        ) : null}

        {current ? <StateGuide code={current.code} stateName={current.name} /> : null}
        {index && code != null && !current ? (
          <p className="midterms-status">We don’t have a guide for “{rawState}”. Pick a state above.</p>
        ) : null}
      </main>
    </MemberProfileProvider>
  )
}
