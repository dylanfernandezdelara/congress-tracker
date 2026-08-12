import { useState } from 'react'

import type { CommitteeLeaderboardRow, CommitteesLeaderboardResponse, StatsChamber } from '../api/types'

type CommitteeLeaderboardProps = {
  house: CommitteesLeaderboardResponse | null
  senate: CommitteesLeaderboardResponse | null
  loading: boolean
  error: string | null
  onRetry?: () => void
}

function formatRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${Math.round(rate * 100)}%`
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="committee-leaderboard-metric">
      <span className="committee-leaderboard-metric-value">{value}</span>
      <span className="committee-leaderboard-metric-label">{label}</span>
    </div>
  )
}

function CommitteeRow({ row }: { row: CommitteeLeaderboardRow }) {
  const [open, setOpen] = useState(false)
  const hasSubs = row.subcommittees.length > 0

  return (
    <li className="committee-leaderboard-row">
      {hasSubs ? (
        <button
          type="button"
          className="committee-leaderboard-row-btn"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="committee-leaderboard-name">{row.name}</span>
          <span className="committee-leaderboard-expand" aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </button>
      ) : (
        <p className="committee-leaderboard-name">{row.name}</p>
      )}
      <div className="committee-leaderboard-metrics">
        <Metric label="Waiting for action" value={row.waiting} />
        <Metric label="Advanced out" value={row.advanced} />
        <Metric label="Share advanced" value={formatRate(row.advance_rate)} />
        {row.median_days_to_advance != null ? (
          <Metric label="Typical days" value={row.median_days_to_advance} />
        ) : null}
      </div>
      {open && hasSubs ? (
        <ul className="committee-leaderboard-subs">
          {row.subcommittees.map((sub) => (
            <li key={sub.system_code}>
              <span className="text-foreground">{sub.name}</span>
              <span className="committee-leaderboard-sub-meta">
                {sub.waiting} waiting · {sub.advanced} advanced · {formatRate(sub.advance_rate)}{' '}
                advanced
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function CommitteeLeaderboard({
  house,
  senate,
  loading,
  error,
  onRetry,
}: CommitteeLeaderboardProps) {
  const [chamber, setChamber] = useState<StatsChamber>('House')
  const data = chamber === 'House' ? house : senate

  const items = data?.items ?? []
  const showLoading = loading && !data
  const showError = Boolean(error && !data)

  return (
    <div className="committee-leaderboard sidebar-widget">
      <div className="committee-leaderboard-toolbar">
        <div className="committee-leaderboard-toggle" role="group" aria-label="Chamber">
          {(['House', 'Senate'] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={`ghost-button text-xs${chamber === c ? ' is-active' : ''}`}
              aria-pressed={chamber === c}
              onClick={() => setChamber(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {showLoading ? <p className="text-xs text-faint">Loading committees…</p> : null}
      {showError ? (
        <div className="space-y-2">
          <p className="text-xs text-fail">{error}</p>
          {onRetry ? (
            <button type="button" className="ghost-button text-xs" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {!showLoading && !showError && items.length === 0 ? (
        <p className="text-xs text-faint">No committee waiting data yet.</p>
      ) : null}
      {!showLoading && !showError && items.length > 0 ? (
        <ol className="committee-leaderboard-list">
          {items.slice(0, 8).map((row) => (
            <CommitteeRow key={row.system_code} row={row} />
          ))}
        </ol>
      ) : null}
      <p className="committee-leaderboard-footnote">
        Waiting = sent to the committee with no advance for 90+ days.
      </p>
    </div>
  )
}
