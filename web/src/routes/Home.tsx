import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchMemberLatest,
  fetchMembersIndex,
  getApiBaseUrl,
  getApiUrlOverride,
  setApiUrlOverride,
  type ActivityItem,
  type MemberActivityResponse,
  type MemberIndexEntry,
} from '../api'

function formatWindowDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateStr
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d)
}

function formatGeneratedAt(ts: string): string {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d)
}

function formatBillLabel(item: ActivityItem): string {
  if (item.type !== 'legislation_action') return ''
  const number = item.bill.number ? `${item.bill.type} ${item.bill.number}` : item.bill.type
  return item.bill.title ? `${number} — ${item.bill.title}` : number
}

function activitySubtitle(item: ActivityItem): string {
  if (item.type !== 'legislation_action') return ''
  const roleLabel = item.role === 'sponsor' ? 'Sponsored' : 'Cosponsored'
  return `${roleLabel} • ${item.action_date}`
}

function SettingsPanel({
  apiBaseUrl,
  onApplied,
}: {
  apiBaseUrl: string
  onApplied: () => void
}) {
  const [inputValue, setInputValue] = useState(() => getApiUrlOverride() ?? '')

  function applyOverride(nextUrl: string | null) {
    setApiUrlOverride(nextUrl)
    onApplied()
  }

  return (
    <section className="settings">
      <h2 className="settings__title">Settings</h2>

      <div className="settings__meta">
        <div className="settings__metaRow">
          <span className="settings__metaLabel">Resolved API base URL:</span>{' '}
          <code className="settings__metaValue">{apiBaseUrl}</code>
        </div>
        <div className="settings__metaRow">
          <span className="settings__metaLabel">Override (localStorage):</span>{' '}
          <code className="settings__metaValue">{getApiUrlOverride() ?? '(none)'}</code>
        </div>
      </div>

      <form
        className="settings__form"
        onSubmit={(e) => {
          e.preventDefault()
          const next = inputValue.trim()
          applyOverride(next ? next : null)
        }}
      >
        <label className="settings__label">
          API URL override
          <input
            className="settings__input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="https://your-worker.your-subdomain.workers.dev"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>

        <div className="settings__actions">
          <button className="settings__button" type="submit">
            Update
          </button>
          <button
            className="settings__button settings__button--secondary"
            type="button"
            onClick={() => {
              setInputValue('')
              applyOverride(null)
            }}
          >
            Clear override
          </button>
        </div>
      </form>
    </section>
  )
}

function Home() {
  const [members, setMembers] = useState<MemberIndexEntry[]>([])
  const [selectedMember, setSelectedMember] = useState<MemberIndexEntry | null>(null)
  const [activity, setActivity] = useState<MemberActivityResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingMembers, setIsLoadingMembers] = useState(true)
  const [isLoadingActivity, setIsLoadingActivity] = useState(false)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [apiBaseUrl, setApiBaseUrl] = useState(() => getApiBaseUrl())

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoadingMembers(true)
      setError(null)
      try {
        const response = await fetchMembersIndex()
        if (cancelled) return
        setMembers(response.members)
        setSelectedMember((prev) => {
          if (prev && response.members.some((m) => m.bioguide_id === prev.bioguide_id)) {
            return prev
          }
          return response.members[0] ?? null
        })
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError) {
          setError(`${e.message} (HTTP ${e.status} ${e.statusText})`)
        } else if (e instanceof Error) {
          setError(e.message)
        } else {
          setError('Unexpected error while fetching data.')
        }
        setMembers([])
      } finally {
        if (!cancelled) setIsLoadingMembers(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [refreshIndex, apiBaseUrl])

  useEffect(() => {
    if (!selectedMember) {
      setActivity(null)
      return
    }

    const member = selectedMember
    let cancelled = false
    async function run() {
      setIsLoadingActivity(true)
      setError(null)
      try {
        const response = await fetchMemberLatest(member.bioguide_id)
        if (cancelled) return
        setActivity(response)
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError) {
          setError(`${e.message} (HTTP ${e.status} ${e.statusText})`)
        } else if (e instanceof Error) {
          setError(e.message)
        } else {
          setError('Unexpected error while fetching data.')
        }
        setActivity(null)
      } finally {
        if (!cancelled) setIsLoadingActivity(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [selectedMember, apiBaseUrl, refreshIndex])

  const activityItems = useMemo(() => activity?.activities ?? [], [activity])

  return (
    <div className="page">
      <header className="pageHeader">
        <h1 className="pageHeader__title">Senator Daily Activity</h1>
        <p className="pageHeader__subtitle">
          Today and previous day activity from Congress.gov, Senate schedules, and GovInfo
        </p>

        <div className="pageHeader__actions">
          <button
            type="button"
            onClick={() => setRefreshIndex((i) => i + 1)}
            disabled={isLoadingMembers || isLoadingActivity}
          >
            {isLoadingMembers || isLoadingActivity ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {activity ? (
          <dl className="headerMeta">
            <div className="headerMeta__row">
              <dt className="headerMeta__label">Window</dt>
              <dd className="headerMeta__value">
                {formatWindowDate(activity.window.start_date)} →{' '}
                {formatWindowDate(activity.window.end_date)}
              </dd>
            </div>
            <div className="headerMeta__row">
              <dt className="headerMeta__label">Generated at</dt>
              <dd className="headerMeta__value">{formatGeneratedAt(activity.generated_at)}</dd>
            </div>
            <div className="headerMeta__row">
              <dt className="headerMeta__label">Congress</dt>
              <dd className="headerMeta__value">
                {activity.congress}
              </dd>
            </div>
          </dl>
        ) : (
          <dl className="headerMeta">
            <div className="headerMeta__row">
              <dt className="headerMeta__label">Resolved API base URL</dt>
              <dd className="headerMeta__value">
                <code>{apiBaseUrl}</code>
              </dd>
            </div>
          </dl>
        )}
      </header>

      {isLoadingMembers || isLoadingActivity ? (
        <div className="state state--loading">Loading senator activity…</div>
      ) : null}

      {error ? (
        <div className="state state--error">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {members.length > 0 ? (
        <main className="content">
          <section className="memberPicker">
            <h2 className="memberPicker__title">Select a senator</h2>
            <div className="memberPicker__controls">
              <select
                className="memberPicker__select"
                value={selectedMember?.bioguide_id ?? ''}
                onChange={(e) => {
                  const next = members.find((m) => m.bioguide_id === e.target.value) ?? null
                  setSelectedMember(next)
                }}
              >
                {members.map((member) => (
                  <option key={member.bioguide_id} value={member.bioguide_id}>
                    {member.name} ({member.party}-{member.state})
                  </option>
                ))}
              </select>
              {selectedMember ? (
                <span className="memberPicker__meta">
                  {selectedMember.party}-{selectedMember.state} • {selectedMember.bioguide_id}
                </span>
              ) : null}
            </div>
          </section>

          {activity ? (
            <>
              {activity.partial && activity.errors.length > 0 ? (
                <div className="state state--warning">
                  Some sources are unavailable (data may be incomplete):{' '}
                  {activity.errors
                    .map((e) => `${e.source.toUpperCase()}: ${e.message}`)
                    .join(' | ')}
                </div>
              ) : null}

              <section className="activitySection">
                <h2 className="activitySection__title">Legislation actions</h2>
                {activityItems.length === 0 ? (
                  <div className="state">No recent sponsored or cosponsored actions.</div>
                ) : (
                  <div className="activityList">
                    {activityItems.map((item, idx) => (
                      <article className="activityCard" key={`${item.type}-${idx}`}>
                        <div className="activityCard__header">
                          <div className="activityCard__title">{formatBillLabel(item)}</div>
                          <div className="activityCard__subtitle">{activitySubtitle(item)}</div>
                        </div>
                        {item.type === 'legislation_action' ? (
                          <div className="activityCard__summary">{item.action_text}</div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="activitySection">
                <h2 className="activitySection__title">Chamber context</h2>
                <div className="contextGrid">
                  <div className="contextCard">
                    <h3>Floor schedule</h3>
                    {activity.context.floor_schedule.length === 0 ? (
                      <p>No floor schedule items found.</p>
                    ) : (
                      activity.context.floor_schedule.map((item, idx) => (
                        <div className="contextItem" key={`floor-${idx}`}>
                          <strong>{item.title}</strong>
                          <div>{item.time ?? 'Time TBA'}</div>
                          {item.summary ? <div>{item.summary}</div> : null}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="contextCard">
                    <h3>Committee meetings</h3>
                    {activity.context.committee_meetings.length === 0 ? (
                      <p>No committee meetings found.</p>
                    ) : (
                      activity.context.committee_meetings.map((item, idx) => (
                        <div className="contextItem" key={`committee-${idx}`}>
                          <strong>{item.committee}</strong>
                          <div>{item.title}</div>
                          <div>{item.time ?? 'Time TBA'}</div>
                          {item.location ? <div>{item.location}</div> : null}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="contextCard">
                    <h3>Daily digest</h3>
                    {activity.context.daily_digest.length === 0 ? (
                      <p>No daily digest items found.</p>
                    ) : (
                      activity.context.daily_digest.map((item, idx) => (
                        <div className="contextItem" key={`digest-${idx}`}>
                          <strong>{item.title}</strong>
                          <div>{item.date}</div>
                          {item.senate_section_url ? (
                            <a href={item.senate_section_url} target="_blank" rel="noreferrer">
                              Senate section
                            </a>
                          ) : item.url ? (
                            <a href={item.url} target="_blank" rel="noreferrer">
                              View digest
                            </a>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          <div className="settingsWrapper">
            <SettingsPanel
              apiBaseUrl={apiBaseUrl}
              onApplied={() => {
                // Recompute base URL (localStorage/env/default), then refetch.
                setApiBaseUrl(getApiBaseUrl())
                setRefreshIndex((i) => i + 1)
              }}
            />
          </div>
        </main>
      ) : (
        <div className="content">
          <SettingsPanel
            apiBaseUrl={apiBaseUrl}
            onApplied={() => {
              setApiBaseUrl(getApiBaseUrl())
              setRefreshIndex((i) => i + 1)
            }}
          />
        </div>
      )}
    </div>
  )
}

export default Home

