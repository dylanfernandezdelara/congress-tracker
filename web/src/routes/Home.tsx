import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchSessionOverview,
  fetchVoteLedger,
  type SessionOverview,
  type VoteLedger,
} from '../api'
import { E2E_LEDGER, E2E_OVERVIEW } from '../e2eData'
import ChamberArc from '../components/ChamberArc'
import DefectionMatrix from '../components/DefectionMatrix'
import StateDumbbell from '../components/StateDumbbell'
import LatestVotes from '../components/LatestVotes'
import {
  buildAttendanceArcVM,
  buildDefectionMatrixVM,
  buildRecentVotesVM,
  buildStateDumbbellVM,
} from '../ui/homeViewModel'

function formatToday(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (HTTP ${error.status})`
  if (error instanceof Error) return error.message
  return 'Unexpected fetch error.'
}

export default function Home() {
  const [ledger, setLedger] = useState<VoteLedger | null>(null)
  const [overview, setOverview] = useState<SessionOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [usingDemo, setUsingDemo] = useState(false)

  const e2eMode = useMemo(
    () => new URLSearchParams(window.location.search).get('e2e') === '1',
    [],
  )

  useEffect(() => {
    let cancelled = false
    async function run() {
      setIsLoading(true)
      setError(null)
      setUsingDemo(false)

      if (e2eMode) {
        if (cancelled) return
        setLedger(E2E_LEDGER)
        setOverview(E2E_OVERVIEW)
        setUsingDemo(true)
        setIsLoading(false)
        return
      }

      try {
        const [ledgerRes, overviewRes] = await Promise.all([
          fetchVoteLedger().catch(() => null),
          fetchSessionOverview().catch(() => null),
        ])
        if (cancelled) return

        if (ledgerRes && overviewRes) {
          setLedger(ledgerRes)
          setOverview(overviewRes)
        } else {
          setLedger(E2E_LEDGER)
          setOverview(E2E_OVERVIEW)
          setUsingDemo(true)
        }
      } catch (e) {
        if (cancelled) return
        setError(normalizeErrorMessage(e))
        setLedger(E2E_LEDGER)
        setOverview(E2E_OVERVIEW)
        setUsingDemo(true)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [e2eMode])

  const arcVM = useMemo(
    () => overview ? buildAttendanceArcVM(overview) : null,
    [overview],
  )

  const matrixVM = useMemo(
    () => ledger && overview ? buildDefectionMatrixVM(ledger, overview) : null,
    [ledger, overview],
  )

  const dumbbellVM = useMemo(
    () => ledger && overview ? buildStateDumbbellVM(ledger, overview) : null,
    [ledger, overview],
  )

  const recentVM = useMemo(
    () => ledger && overview ? buildRecentVotesVM(ledger, overview) : null,
    [ledger, overview],
  )

  return (
    <div className="page">
      <header className="dashHeader">
        <p className="dashHeader__eyebrow">Senate Pulse</p>
        <h1 className="dashHeader__title">119th Congress at a glance</h1>
        <div className="dashHeader__metaRow">
          <span>{formatToday()}</span>
          {overview && <span>Updated {formatTimestamp(overview.generated_at)}</span>}
          {overview && <span>Session {overview.session}</span>}
        </div>
      </header>

      {usingDemo && (
        <div className="banner banner--demo" role="status">
          Showing demo data &mdash; run worker ingestion to see live data.
        </div>
      )}

      {error && (
        <div className="banner banner--error" role="status">{error}</div>
      )}

      {isLoading ? (
        <p className="loadingLine">Loading&hellip;</p>
      ) : (
        <>
          {arcVM && arcVM.length > 0 && (
            <section className="vizSection" aria-label="Chamber attendance">
              <h2 className="vizSection__title">The chamber</h2>
              <p className="vizSection__subtitle">
                Who shows up? Solid = full attendance. Faded = missed votes. Dashed = absent all session.
              </p>
              <ChamberArc senators={arcVM} />
              <div className="vizLegend">
                <span className="vizLegend__item">
                  <span className="vizLegend__swatch" style={{ background: '#2563eb' }} /> Democrat
                </span>
                <span className="vizLegend__item">
                  <span className="vizLegend__swatch" style={{ background: '#dc2626' }} /> Republican
                </span>
                <span className="vizLegend__item">
                  <span className="vizLegend__swatch" style={{ background: '#7c3aed' }} /> Independent
                </span>
                <span className="vizLegend__item">
                  <span className="vizLegend__swatch" style={{ background: 'transparent', border: '1.5px dashed #a8a29e' }} /> Absent
                </span>
              </div>
            </section>
          )}

          {matrixVM && matrixVM.rows.length > 0 && (
            <section className="vizSection" aria-label="Defection matrix">
              <h2 className="vizSection__title">Who breaks ranks?</h2>
              <p className="vizSection__subtitle">
                {matrixVM.rows.length} senators with 2+ defections across {matrixVM.columns.length} votes.
                Amber = crossed party line. Similar patterns reveal coalitions.
              </p>
              <DefectionMatrix matrix={matrixVM} />
            </section>
          )}

          {dumbbellVM && dumbbellVM.length > 0 && (
            <section className="vizSection" aria-label="State delegation agreement">
              <h2 className="vizSection__title">State delegations</h2>
              <p className="vizSection__subtitle">
                How often do same-state senators vote together? Sorted by agreement.
                Dot color = party. Line length = disagreement.
              </p>
              <StateDumbbell pairs={dumbbellVM} />
            </section>
          )}

          {recentVM && recentVM.length > 0 && (
            <section className="vizSection" aria-label="Recent votes">
              <h2 className="vizSection__title">Latest votes</h2>
              <p className="vizSection__subtitle">
                Most recent roll calls with named party-line crossovers.
              </p>
              <LatestVotes votes={recentVM} />
            </section>
          )}
        </>
      )}
    </div>
  )
}
