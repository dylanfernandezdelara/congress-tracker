import { useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  fetchActivitiesIndex,
  fetchSessionOverview,
  fetchVoteLedger,
  type ActivityIndexResponse,
  type SessionOverview,
  type VoteLedger,
} from '../api'
import { E2E_ACTIVITIES, E2E_LEDGER, E2E_OVERVIEW } from '../e2eData'
import ActionCards from '../components/ActionCards'
import InsightFeed from '../components/InsightFeed'
import InsightFeedErrorBoundary from '../components/InsightFeedErrorBoundary'
import SwingLeaderboard from '../components/SwingLeaderboard'
import ComingUp from '../components/ComingUp'
import TopDevelopments from '../components/TopDevelopments'
import StateDumbbell from '../components/StateDumbbell'
import ChamberArc from '../components/ChamberArc'
import {
  buildAttendanceArcVM,
  buildBillTimelineVM,
  buildComingUpVM,
  buildHomepageSpotlightVM,
  buildGatekeepersVM,
  buildStateDumbbellVM,
  buildSwingFrequencyIndex,
  toActionCards,
  toInsightCards,
} from '../ui/homeViewModel'
import { getFeatureFlag } from '../utils/featureFlags'

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

function formatDateWindow(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(date.getTime())) return dateStr
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
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
  const [activities, setActivities] = useState<ActivityIndexResponse | null>(null)
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
        setActivities(E2E_ACTIVITIES)
        setUsingDemo(true)
        setIsLoading(false)
        return
      }

      try {
        const [ledgerResult, overviewResult, activitiesResult] = await Promise.allSettled([
          fetchVoteLedger(),
          fetchSessionOverview(),
          fetchActivitiesIndex(),
        ])
        if (cancelled) return

        const ledgerRes = ledgerResult.status === 'fulfilled' ? ledgerResult.value : null
        const overviewRes = overviewResult.status === 'fulfilled' ? overviewResult.value : null
        const activitiesRes = activitiesResult.status === 'fulfilled' ? activitiesResult.value : null

        if (!ledgerRes || !overviewRes) {
          const loadErrors: string[] = []
          if (ledgerResult.status === 'rejected') {
            loadErrors.push(`vote ledger: ${normalizeErrorMessage(ledgerResult.reason)}`)
          }
          if (overviewResult.status === 'rejected') {
            loadErrors.push(`session overview: ${normalizeErrorMessage(overviewResult.reason)}`)
          }
          setLedger(null)
          setOverview(null)
          setActivities(null)
          setError(
            loadErrors.length > 0
              ? `Live data unavailable. ${loadErrors.join(' | ')}`
              : 'Live data unavailable.'
          )
          return
        }

        setLedger(ledgerRes)
        setOverview(overviewRes)
        setActivities(activitiesRes)

        if (activitiesResult.status === 'rejected') {
          setError(
            `Loaded votes and overview, but activities are unavailable: ${normalizeErrorMessage(activitiesResult.reason)}`
          )
        }
      } catch (e) {
        if (cancelled) return
        setError(`Unexpected fetch error: ${normalizeErrorMessage(e)}`)
        setLedger(null)
        setOverview(null)
        setActivities(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [e2eMode])

  const billTimelineVM = useMemo(
    () => ledger && overview ? buildBillTimelineVM(ledger, overview, activities, { windowDays: 7 }) : null,
    [ledger, overview, activities],
  )

  const homepageSpotlight = useMemo(
    () => buildHomepageSpotlightVM(billTimelineVM, 3),
    [billTimelineVM],
  )

  const billTimelineWindow = useMemo(() => {
    if (!billTimelineVM || billTimelineVM.length === 0) return null
    const sortedDates = [...billTimelineVM.map((item) => item.latestDate)].sort()
    return {
      start: sortedDates[0],
      end: sortedDates[sortedDates.length - 1],
    }
  }, [billTimelineVM])

  const swingIndex = useMemo(
    () => ledger && overview ? buildSwingFrequencyIndex(ledger, overview, activities) : null,
    [ledger, overview, activities],
  )

  const gatekeepers = useMemo(
    () => ledger && overview ? buildGatekeepersVM(ledger, overview) : [],
    [ledger, overview],
  )

  const comingUpVM = useMemo(
    () => buildComingUpVM(activities),
    [activities],
  )

  const dumbbellVM = useMemo(
    () => ledger && overview ? buildStateDumbbellVM(ledger, overview) : null,
    [ledger, overview],
  )

  const arcVM = useMemo(
    () => overview ? buildAttendanceArcVM(overview) : null,
    [overview],
  )

  const actionCards = useMemo(
    () => billTimelineVM && swingIndex ? toActionCards(billTimelineVM, swingIndex) : null,
    [billTimelineVM, swingIndex],
  )

  const insightCards = useMemo(
    () => billTimelineVM && swingIndex ? toInsightCards(billTimelineVM, swingIndex) : null,
    [billTimelineVM, swingIndex],
  )

  const useInsightFeed = useMemo(() => getFeatureFlag('insightFeed'), [])

  return (
    <div className="page">
      <header className="dashHeader">
        <p className="dashHeader__eyebrow">Senate Pulse</p>
        <h1 className="dashHeader__title">Your daily Senate briefing</h1>
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
          {homepageSpotlight.length > 0 && (
            <section className="vizSection" aria-label="Top developments">
              <h2 className="vizSection__title">Top developments</h2>
              <p className="vizSection__subtitle">
                Prioritized by policy relevance and recency so major Senate actions are immediately visible.
              </p>
              <TopDevelopments items={homepageSpotlight} />
            </section>
          )}

          {actionCards && actionCards.length > 0 && (
            <section className="vizSection" aria-label="Recent votes">
              <h2 className="vizSection__title">Recent vote details</h2>
              <p className="vizSection__subtitle">
                {billTimelineWindow
                  ? `From ${formatDateWindow(billTimelineWindow.start)} to ${formatDateWindow(billTimelineWindow.end)}.`
                  : 'Recent Senate actions, explained in plain language.'}
              </p>
              {useInsightFeed && insightCards && insightCards.length > 0 ? (
                <InsightFeedErrorBoundary
                  fallback={<ActionCards cards={actionCards} />}
                >
                  <InsightFeed cards={insightCards} />
                </InsightFeedErrorBoundary>
              ) : (
                <ActionCards cards={actionCards} />
              )}
            </section>
          )}

          {swingIndex && (swingIndex.profiles.size > 0 || gatekeepers.length > 0) && (
            <section className="vizSection" aria-label="Swing signals">
              <h2 className="vizSection__title">Swing signals</h2>
              <p className="vizSection__subtitle">
                Senators who most often break party ranks on close votes, and the topics where they do it.
              </p>
              <SwingLeaderboard swingIndex={swingIndex} gatekeepers={gatekeepers} />
            </section>
          )}

          {comingUpVM.length > 0 && (
            <section className="vizSection" aria-label="Upcoming schedule">
              <h2 className="vizSection__title">Upcoming schedule</h2>
              <p className="vizSection__subtitle">
                Floor votes and committee hearings on the schedule.
              </p>
              <ComingUp items={comingUpVM} />
            </section>
          )}

          {dumbbellVM && dumbbellVM.length > 0 && (
            <section className="vizSection" aria-label="State delegation agreement">
              <h2 className="vizSection__title">State delegation agreement</h2>
              <p className="vizSection__subtitle">
                How often do same-state senators vote together? Sorted by agreement.
                Dot color = party. Line length = disagreement.
              </p>
              <StateDumbbell pairs={dumbbellVM} />
            </section>
          )}

          {arcVM && arcVM.length > 0 && (
            <section className="vizSection" aria-label="Chamber attendance">
              <h2 className="vizSection__title">Attendance</h2>
              <p className="vizSection__subtitle">
                Solid = full attendance. Faded = missed votes. Dashed = absent all session.
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
        </>
      )}
    </div>
  )
}
