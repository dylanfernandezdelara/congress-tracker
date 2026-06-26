import { useEffect, useState } from 'react'

import { fetchVoteDefectors } from '../api/client'
import type { FeedItem, FeedPassageVote, VoteDefectorEntry } from '../api/types'
import { congressGovBillUrl, formatBillDocket, formatVoteDate } from '../utils/billLabels'
import { formatExecutiveRoleDetail } from '../utils/executiveLabels'
import { isProceduralFeedItem } from '../utils/feedRowLabels'
import { policyAreaChipClass, policyAreaChipStyle } from '../utils/policyAreaChip'
import { FeedRowExecutiveQuote } from './FeedRowExecutiveQuote'

type FeedRowDetailProps = {
  item: FeedItem
}

type RollDefectorsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; defectors: VoteDefectorEntry[] }
  | { status: 'unavailable' }
  | { status: 'error' }

function voteRollKey(vote: FeedPassageVote): string | null {
  if (
    vote.congress === undefined ||
    vote.session === undefined ||
    vote.roll_number === undefined
  ) {
    return null
  }
  return `${vote.chamber}:${vote.congress}:${vote.session}:${vote.roll_number}`
}

function formatVoteSide(side: 'yea' | 'nay'): string {
  return side === 'yea' ? 'Yea' : 'Nay'
}

function VoteSplitBar({ yeas, nays }: { yeas: number; nays: number }) {
  const total = yeas + nays
  if (total === 0) {
    return <div className="h-1 w-full rounded-full bg-surface-subtle" />
  }

  return (
    <div className="flex h-1 w-full gap-0.5 overflow-hidden rounded-full bg-surface-subtle">
      {yeas > 0 ? <div className="rounded-full bg-pass" style={{ flex: yeas }} /> : null}
      {nays > 0 ? <div className="rounded-full bg-fail opacity-75" style={{ flex: nays }} /> : null}
    </div>
  )
}

function PartyDefectorsList({
  vote,
  state,
}: {
  vote: FeedPassageVote
  state: RollDefectorsState
}) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <p className="feed-row-defectors-empty text-sm text-faint">Loading party defectors…</p>
  }

  if (state.status === 'unavailable') {
    return (
      <p className="feed-row-defectors-empty text-sm text-faint">
        Per-member vote breakdown is not available for this roll call yet.
      </p>
    )
  }

  if (state.status === 'error') {
    return (
      <p className="feed-row-defectors-empty text-sm text-faint">
        Party defector data is temporarily unavailable.
      </p>
    )
  }

  if (state.defectors.length === 0) {
    return (
      <p className="feed-row-defectors-empty text-sm text-faint">
        No members broke with their party on this {vote.chamber} vote.
      </p>
    )
  }

  return (
    <ul className="feed-row-defectors-list">
      {state.defectors.map((defector) => (
        <li key={defector.bioguide_id} className="feed-row-defector">
          <a
            href={defector.congress_gov_url}
            target="_blank"
            rel="noopener noreferrer"
            className="feed-row-defector-name congress-link"
          >
            {defector.name}
          </a>
          <span className="feed-row-defector-meta">
            {defector.party}-{defector.state} · voted {formatVoteSide(defector.position)} (party{' '}
            {formatVoteSide(defector.party_line)})
          </span>
        </li>
      ))}
    </ul>
  )
}

function PassageVoteDetails({
  votes,
  defectorsByRoll,
}: {
  votes: FeedPassageVote[]
  defectorsByRoll: Map<string, RollDefectorsState>
}) {
  if (votes.length === 0) {
    return <p className="text-sm text-faint">No passage vote recorded yet.</p>
  }

  return (
    <div className="space-y-4">
      {votes.map((vote) => {
        const rollKey = voteRollKey(vote)
        const defectorsState = rollKey ? (defectorsByRoll.get(rollKey) ?? { status: 'idle' }) : { status: 'unavailable' as const }

        return (
          <div key={`${vote.chamber}-${vote.date}-${vote.question}`} className="space-y-2">
            <div className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <p className="font-medium text-foreground">{vote.chamber}</p>
                <p className="shrink-0 font-medium tabular-nums text-secondary">
                  {vote.yeas}–{vote.nays}
                </p>
              </div>
              <p className="text-sm text-faint">{formatVoteDate(vote.date)}</p>
            </div>
            <VoteSplitBar yeas={vote.yeas} nays={vote.nays} />
            <div className="feed-row-defectors">
              <p className="feed-row-defectors-label">Party defectors</p>
              <PartyDefectorsList vote={vote} state={defectorsState} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ExecutiveContextSection({ item }: { item: FeedItem }) {
  const signals = item.executive_signals ?? []
  const related = item.related_executive_bills ?? []
  if (signals.length === 0) return null

  return (
    <section className="feed-row-detail-section feed-row-detail-section--executive">
      <h3 className="feed-row-detail-heading">Executive context</h3>
      <ul className="feed-row-executive-list">
        {signals.map((signal) => (
          <li key={signal.post_id} className="feed-row-executive-item">
            <FeedRowExecutiveQuote signal={signal} bill={item.bill} />
          </li>
        ))}
      </ul>
      {related.length > 0 ? (
        <div className="feed-row-executive-related">
          <p className="feed-row-executive-related-label">Also mentions</p>
          <ul className="feed-row-executive-related-list">
            {related.map((bill) => (
              <li key={`${bill.congress}-${bill.type}-${bill.number}`}>
                <a
                  href={congressGovBillUrl(bill.congress, bill.type, bill.number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="congress-link text-sm"
                >
                  {formatBillDocket(bill.type, bill.number, bill.congress)}
                  {bill.title ? ` — ${bill.title}` : ''}
                </a>
                <span className="text-sm text-faint">
                  {' '}
                  · {formatExecutiveRoleDetail(bill.role)}
                  {bill.reason && bill.reason !== 'mentioned_in_same_post' ? ` — ${bill.reason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="feed-row-executive-disclaimer text-sm text-faint">
        Informal presidential statement — not recorded on Congress.gov.
      </p>
    </section>
  )
}

export function FeedRowDetail({ item }: FeedRowDetailProps) {
  const sourceUrl = congressGovBillUrl(item.bill.congress, item.bill.type, item.bill.number)
  const isProcedural = isProceduralFeedItem(item)
  const [defectorsByRoll, setDefectorsByRoll] = useState<Map<string, RollDefectorsState>>(
    () => new Map(),
  )

  useEffect(() => {
    let cancelled = false
    const rollKeys = item.passage_votes
      .map((vote) => {
        const key = voteRollKey(vote)
        if (!key || vote.congress === undefined || vote.session === undefined || vote.roll_number === undefined) {
          return null
        }
        return {
          key,
          vote,
          congress: vote.congress,
          session: vote.session,
          rollNumber: vote.roll_number,
        }
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (rollKeys.length === 0) return

    setDefectorsByRoll((current) => {
      const next = new Map(current)
      for (const { key } of rollKeys) {
        if (!next.has(key)) next.set(key, { status: 'loading' })
      }
      return next
    })

    void Promise.all(
      rollKeys.map(async ({ key, vote, congress, session, rollNumber }) => {
        try {
          const response = await fetchVoteDefectors({
            chamber: vote.chamber,
            congress,
            session,
            rollNumber,
          })
          if (cancelled) return
          setDefectorsByRoll((current) => {
            const next = new Map(current)
            next.set(key, { status: 'ready', defectors: response.defectors })
            return next
          })
        } catch {
          if (cancelled) return
          setDefectorsByRoll((current) => {
            const next = new Map(current)
            next.set(key, { status: 'error' })
            return next
          })
        }
      }),
    )

    return () => {
      cancelled = true
    }
  }, [item.passage_votes])

  return (
    <div className="feed-row-detail">
      {isProcedural ? (
        <div className="feed-row-detail-chips flex flex-wrap gap-2">
          <span
            className={policyAreaChipClass('Procedural')}
            style={policyAreaChipStyle('Procedural')}
          >
            Procedural
          </span>
        </div>
      ) : null}

      <ExecutiveContextSection item={item} />

      <section className="feed-row-detail-section">
        <h3 className="feed-row-detail-heading">Vote history</h3>
        <PassageVoteDetails votes={item.passage_votes} defectorsByRoll={defectorsByRoll} />
      </section>

      <footer className="feed-row-detail-footer">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="congress-link text-sm"
        >
          Read on congress.gov ↗
        </a>
      </footer>
    </div>
  )
}
