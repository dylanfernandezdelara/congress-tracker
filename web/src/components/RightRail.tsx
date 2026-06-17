import type { ChamberPulse, PulseStatsResponse } from '../api/types'
import { formatBillDocket } from '../utils/billLabels'

type RightRailProps = {
  pulse: PulseStatsResponse | null
  loading: boolean
  error: string | null
  onRetry?: () => void
}

function ChamberPulseSection({ title, data }: { title: string; data: ChamberPulse | undefined }) {
  if (!data) return null

  return (
    <section className="sidebar-chamber space-y-4">
      <h2 className="sidebar-chamber-title text-[11px] font-semibold uppercase tracking-widest text-faint">
        {title}
      </h2>

      <div className="sidebar-widget space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Close votes</h3>
        {data.close_votes.length === 0 ? (
          <p className="text-xs text-faint">None in stored data.</p>
        ) : (
          <ol className="space-y-2 text-[12px] text-secondary">
            {data.close_votes.map((v) => (
              <li key={`${v.chamber}-${v.roll_number}-${v.vote_date}`}>
                <span className="font-medium text-foreground">
                  {formatBillDocket(v.bill_type, v.bill_number, v.congress)}
                </span>
                <span className="text-faint">
                  {' '}
                  · {v.yeas}–{v.nays} ({v.margin}) · {v.vote_date}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="sidebar-widget space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">Policy heat</h3>
        {data.policy_heat.length === 0 ? (
          <p className="text-xs text-faint">No policy areas tagged yet.</p>
        ) : (
          <ol className="space-y-1 text-[12px] text-secondary">
            {data.policy_heat.map((p) => (
              <li key={p.policy_area}>
                {p.policy_area} <span className="text-faint">({p.bill_count})</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="sidebar-widget space-y-2">
        <h3 className="text-[12px] font-medium text-foreground">This week</h3>
        <p className="text-[12px] text-secondary">
          {data.this_week.count} passage {data.this_week.count === 1 ? 'vote' : 'votes'}
          {data.this_week.headline ? (
            <>
              {' '}
              — <span className="text-foreground">{data.this_week.headline}</span>
            </>
          ) : null}
        </p>
      </div>
    </section>
  )
}

export function RightRail({ pulse, loading, error, onRetry }: RightRailProps) {
  if (loading) {
    return <p className="text-xs text-faint">Loading pulse…</p>
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

  if (!pulse) {
    return null
  }

  return (
    <div className="sidebar-panel space-y-6">
      <p className="text-[11px] text-faint">Legislative pulse</p>
      <ChamberPulseSection title="House" data={pulse.house} />
      <div className="border-t border-border" />
      <ChamberPulseSection title="Senate" data={pulse.senate} />
    </div>
  )
}
