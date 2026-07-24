import type { FeedPassageVote, VoteDefectorEntry } from '../api/types'
import {
  MEMBER_VOTES_ERROR,
  MEMBER_VOTES_UNAVAILABLE,
  noPartyDefectorsMessage,
} from '../constants/memberVotesCopy'
import type { RollDefectorsState } from '../hooks/useRollDefectors'
import { voteRollKey } from '../hooks/useRollDefectors'
import { formatVoteDate } from '../utils/billLabels'

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
    return <p className="feed-row-defectors-empty">Loading party defectors…</p>
  }

  if (state.status === 'unavailable') {
    return <p className="feed-row-defectors-empty">{MEMBER_VOTES_UNAVAILABLE}</p>
  }

  if (state.status === 'error') {
    return <p className="feed-row-defectors-empty">{MEMBER_VOTES_ERROR}</p>
  }

  if (state.defectors.length === 0) {
    return (
      <p className="feed-row-defectors-empty">{noPartyDefectorsMessage(vote.chamber)}</p>
    )
  }

  return (
    <ul className="feed-row-defectors-list">
      {state.defectors.map((defector: VoteDefectorEntry) => (
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

export function PassageVoteDetails({
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
        const defectorsState = rollKey
          ? (defectorsByRoll.get(rollKey) ?? { status: 'idle' as const })
          : { status: 'unavailable' as const }

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
