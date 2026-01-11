import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchLatestNY,
  getApiBaseUrl,
  getApiUrlOverride,
  setApiUrlOverride,
  type LatestStateResponse,
  type VoteMember,
} from '../api'

type VoteCast = VoteMember['vote_cast']

type SenatorSummaryRow = {
  name: string
  total: number
  yeas: number
  nays: number
  present: number
  notVoting: number
}

function formatVoteDate(voteDate: string): string {
  // vote_date is YYYY-MM-DD; anchor to UTC midnight for stable display.
  const d = new Date(`${voteDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return voteDate
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

function voteCastKey(voteCast: VoteCast): 'yea' | 'nay' | 'present' | 'not-voting' | 'unknown' {
  switch (voteCast) {
    case 'Yea':
      return 'yea'
    case 'Nay':
      return 'nay'
    case 'Present':
      return 'present'
    case 'Not Voting':
      return 'not-voting'
    default:
      return 'unknown'
  }
}

function resultKey(result: string): 'passed' | 'failed' | 'neutral' {
  const r = result.toLowerCase()
  if (r.includes('agreed') || r.includes('passed') || r.includes('confirmed') || r.includes('invoked')) return 'passed'
  if (r.includes('rejected') || r.includes('failed') || r.includes('not agreed') || r.includes('not invoked')) return 'failed'
  return 'neutral'
}

function buildSenatorSummary(data: LatestStateResponse): SenatorSummaryRow[] {
  const byName = new Map<string, SenatorSummaryRow>()

  for (const vote of data.votes) {
    for (const member of vote.members) {
      const existing =
        byName.get(member.name) ??
        ({
          name: member.name,
          total: 0,
          yeas: 0,
          nays: 0,
          present: 0,
          notVoting: 0,
        } satisfies SenatorSummaryRow)

      existing.total += 1
      switch (member.vote_cast) {
        case 'Yea':
          existing.yeas += 1
          break
        case 'Nay':
          existing.nays += 1
          break
        case 'Present':
          existing.present += 1
          break
        case 'Not Voting':
          existing.notVoting += 1
          break
        default:
          break
      }

      byName.set(member.name, existing)
    }
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
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
  const [data, setData] = useState<LatestStateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [apiBaseUrl, setApiBaseUrl] = useState(() => getApiBaseUrl())

  useEffect(() => {
    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetchLatestNY()
        if (cancelled) return
        setData(response)
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError) {
          setError(`${e.message} (HTTP ${e.status} ${e.statusText})`)
        } else if (e instanceof Error) {
          setError(e.message)
        } else {
          setError('Unexpected error while fetching data.')
        }
        setData(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [refreshIndex, apiBaseUrl])

  const senatorSummary = useMemo(() => (data ? buildSenatorSummary(data) : []), [data])

  return (
    <div className="page">
      <header className="pageHeader">
        <h1 className="pageHeader__title">New York Senators Voting Record</h1>
        <p className="pageHeader__subtitle">Latest Senate roll-call votes for NY senators</p>

        <div className="pageHeader__actions">
          <button
            type="button"
            onClick={() => setRefreshIndex((i) => i + 1)}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {data ? (
          <dl className="headerMeta">
            <div className="headerMeta__row">
              <dt className="headerMeta__label">Vote date</dt>
              <dd className="headerMeta__value">{formatVoteDate(data.vote_date)}</dd>
            </div>
            <div className="headerMeta__row">
              <dt className="headerMeta__label">Generated at</dt>
              <dd className="headerMeta__value">{formatGeneratedAt(data.generated_at)}</dd>
            </div>
            <div className="headerMeta__row">
              <dt className="headerMeta__label">Congress / Session</dt>
              <dd className="headerMeta__value">
                {data.congress} / {data.session}
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

      {isLoading ? (
        <div className="state state--loading">Loading latest votes…</div>
      ) : null}

      {error ? (
        <div className="state state--error">
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {data ? (
        <main className="content">
          <section className="senatorSummary">
            <h2 className="senatorSummary__title">Senator summary</h2>
            <div className="senatorSummary__grid">
              {senatorSummary.map((s) => (
                <div className="senatorCard" key={s.name}>
                  <div className="senatorCard__name">{s.name}</div>
                  <div className="senatorCard__totals">Total: {s.total}</div>
                  <ul className="senatorCard__breakdown">
                    <li className="senatorCard__item senatorCard__item--yea">Yea: {s.yeas}</li>
                    <li className="senatorCard__item senatorCard__item--nay">Nay: {s.nays}</li>
                    <li className="senatorCard__item senatorCard__item--present">Present: {s.present}</li>
                    <li className="senatorCard__item senatorCard__item--not-voting">Not Voting: {s.notVoting}</li>
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="votes">
            <h2 className="votes__title">Votes</h2>
            <div className="votes__list">
              {data.votes.map((vote) => {
                const rk = resultKey(vote.result)
                return (
                  <article className="voteCard" key={vote.vote_number}>
                    <header className="voteCard__header">
                      <div className="voteCard__topRow">
                        <div className="voteCard__number">Roll Call {vote.vote_number}</div>
                        <span className={`resultBadge resultBadge--${rk}`}>
                          {vote.result}
                        </span>
                      </div>

                      <h3 className="voteCard__title">{vote.title}</h3>
                      <div className="voteCard__question">{vote.question}</div>
                      {vote.issue ? (
                        <div className="voteCard__issue">
                          Issue: <code>{vote.issue}</code>
                        </div>
                      ) : null}
                    </header>

                    <div className="voteCounts">
                      <span className="voteCounts__item voteCounts__item--yea">Yea: {vote.counts.yeas}</span>
                      <span className="voteCounts__item voteCounts__item--nay">Nay: {vote.counts.nays}</span>
                      <span className="voteCounts__item voteCounts__item--present">Present: {vote.counts.present}</span>
                      <span className="voteCounts__item voteCounts__item--absent">Not Voting: {vote.counts.absent}</span>
                    </div>

                    <div className="memberVotes">
                      {vote.members.map((m) => {
                        const ck = voteCastKey(m.vote_cast)
                        return (
                          <div className={`memberCard memberCard--${ck}`} key={m.name}>
                            <div className="memberCard__name">{m.name}</div>
                            <div className="memberCard__meta">
                              {m.party}-{m.state}
                            </div>
                            <div className={`memberCard__voteCast voteCast voteCast--${ck}`}>
                              {m.vote_cast}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>

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

