import { useState } from 'react'

import type { FeedCompanionVote, FeedPassageVote, VoteDefectorEntry } from '../api/types'
import {
  DEFECTOR_GROUP_COLLAPSE_THRESHOLD,
  MEMBER_VOTES_ERROR,
  MEMBER_VOTES_UNAVAILABLE,
  noPartyDefectorsMessage,
} from '../constants/memberVotesCopy'
import type { RollDefectorsState } from '../hooks/useRollDefectors'
import { voteRollKey } from '../hooks/useRollDefectors'
import { formatVoteDate } from '../utils/billLabels'
import {
  formatPartySplits,
  groupDefectorsByParty,
  type DefectorPartyGroup,
} from '../utils/partySplit'
import { CompanionVotes } from './CompanionVotes'

export function VoteSplitBar({
  chamber,
  yeas,
  nays,
}: {
  chamber: string
  yeas: number
  nays: number
}) {
  const total = yeas + nays
  const label = `${chamber} vote: ${yeas} yea, ${nays} nay`
  if (total === 0) {
    return (
      <div
        role="img"
        aria-label={label}
        className="h-1 w-full rounded-full bg-surface-subtle"
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-1 w-full gap-0.5 overflow-hidden rounded-full bg-surface-subtle"
    >
      {yeas > 0 ? <div className="rounded-full bg-pass" style={{ flex: yeas }} aria-hidden="true" /> : null}
      {nays > 0 ? (
        <div className="rounded-full bg-fail opacity-75" style={{ flex: nays }} aria-hidden="true" />
      ) : null}
    </div>
  )
}

function DefectorGroup({ group }: { group: DefectorPartyGroup }) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = group.members.length > DEFECTOR_GROUP_COLLAPSE_THRESHOLD
  const visible =
    collapsible && !expanded
      ? group.members.slice(0, DEFECTOR_GROUP_COLLAPSE_THRESHOLD)
      : group.members
  const hidden = group.members.length - visible.length

  return (
    <div className="feed-row-defector-group">
      <p className="feed-row-defector-group-summary">{group.summary}</p>
      <ul className="feed-row-defectors-list">
        {visible.map((defector: VoteDefectorEntry) => (
          <li key={defector.bioguide_id} className="feed-row-defector">
            {defector.congress_gov_url ? (
              <a
                href={defector.congress_gov_url}
                target="_blank"
                rel="noopener noreferrer"
                className="feed-row-defector-name congress-link"
              >
                {defector.name}
              </a>
            ) : (
              <span className="feed-row-defector-name">{defector.name}</span>
            )}
            <span className="feed-row-defector-meta">
              {defector.party}-{defector.state}
            </span>
          </li>
        ))}
      </ul>
      {collapsible ? (
        <button
          type="button"
          className="feed-row-defector-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Show fewer' : `Show all ${group.members.length}`}
        </button>
      ) : null}
      {collapsible && !expanded && hidden > 0 ? (
        <span className="sr-only">{hidden} more not shown</span>
      ) : null}
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
    <div className="feed-row-defector-groups">
      {groupDefectorsByParty(state.defectors, state.partySplits).map((group) => (
        <DefectorGroup key={`${group.party}-${group.position}`} group={group} />
      ))}
    </div>
  )
}

function PartySplitLine({ state }: { state: RollDefectorsState }) {
  if (state.status !== 'ready' || state.partySplits.length === 0) return null
  return (
    <p className="feed-row-party-split" data-feed-party-split>
      {formatPartySplits(state.partySplits)}
    </p>
  )
}

export function PassageVoteDetails({
  votes,
  defectorsByRoll,
  companionVotes = [],
}: {
  votes: FeedPassageVote[]
  defectorsByRoll: Map<string, RollDefectorsState>
  companionVotes?: FeedCompanionVote[]
}) {
  if (votes.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-faint">No passage vote recorded yet.</p>
        <CompanionVotes votes={companionVotes} />
      </div>
    )
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
            <VoteSplitBar chamber={vote.chamber} yeas={vote.yeas} nays={vote.nays} />
            <PartySplitLine state={defectorsState} />
            <div className="feed-row-defectors">
              <p className="feed-row-defectors-label">Crossed party lines</p>
              <PartyDefectorsList vote={vote} state={defectorsState} />
            </div>
          </div>
        )
      })}
      <CompanionVotes votes={companionVotes} />
    </div>
  )
}
