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

function CommitteeRow({ row }: { row: CommitteeLeaderboardRow }) {
  const [open, setOpen] = useState(false)
  const hasSubs = row.subcommittees.length > 0

  return (
    <li className="committee-leaderboard-row">
      <button
        type="button"
        className="ghost-button text-left w-full"
        aria-expanded={hasSubs ? open : undefined}
        onClick={() => {
          if (hasSubs) setOpen((v) => !v)
        }}
        disabled={!hasSubs}
      >
        <span className="text-[12px] font-medium text-foreground">{row.name}</span>
        <div className="committee-leaderboard-metrics">
          <span>Waiting: {row.waiting}</span>
          <span>Advanced out: {row.advanced}</span>
          <span>Share advanced: {formatRate(row.advance_rate)}</span>
          {row.median_days_to_advance != null ? (
            <span>Typical days: {row.median_days_to_advance}</span>
          ) : null}
        </div>
      </button>
      {open && hasSubs ? (
        <ul className="committee-leaderboard-subs">
          {row.subcommittees.map((sub) => (
            <li key={sub.system_code}>
              <span className="text-foreground">{sub.name}</span>
              {' · '}
              waiting {sub.waiting}, advanced {sub.advanced},{' '}
              {formatRate(sub.advance_rate)} advanced
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

  if (loading) {
    return <p className="text-xs text-faint">Loading committees…</p>
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-fail">{error}</p>
        {onRetry ? (
          <button type="button" className="ghost-button text-xs" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    )
  }

  const items = data?.items ?? []

  return (
    <div className="committee-leaderboard sidebar-widget">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium text-foreground">Committee waiting list</h3>
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
      {items.length === 0 ? (
        <p className="text-xs text-faint">No committee process data yet.</p>
      ) : (
        <ol className="space-y-1">
          {items.slice(0, 8).map((row) => (
            <CommitteeRow key={row.system_code} row={row} />
          ))}
        </ol>
      )}
      <p className="text-[11px] text-faint">
        Waiting = sent to the committee with no advance for 90+ days.
      </p>
    </div>
  )
}
