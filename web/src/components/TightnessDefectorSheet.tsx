import { useEffect, useId, useState } from 'react'

import { loadRollDefectors } from '../api/rollDefectorsCache'
import type { RollPartySplit, TightnessDot, VoteDefectorEntry } from '../api/types'
import {
  MEMBER_VOTES_ERROR,
  MEMBER_VOTES_UNAVAILABLE,
  noPartyDefectorsMessage,
} from '../constants/memberVotesCopy'
import { formatVoteDate } from '../utils/billLabels'
import { formatPartySplits, groupDefectorsByParty } from '../utils/partySplit'
import { cohesionLabel, tightnessDotLabel } from '../utils/tightnessLabels'
import { AnimatedSheet } from './AnimatedSheet'

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; defectors: VoteDefectorEntry[]; partySplits: RollPartySplit[] }
  | { status: 'unavailable' }
  | { status: 'error' }

type TightnessDefectorSheetProps = {
  open: boolean
  dot: TightnessDot | null
  selectionKey: number
  onClose: () => void
}

export function TightnessDefectorSheet({
  open,
  dot,
  selectionKey,
  onClose,
}: TightnessDefectorSheetProps) {
  const titleId = useId()
  const [state, setState] = useState<LoadState>({ status: 'idle' })

  useEffect(() => {
    if (!open || !dot) {
      setState({ status: 'idle' })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })
    void loadRollDefectors({
      chamber: dot.chamber,
      congress: dot.congress,
      session: dot.session,
      rollNumber: dot.roll_number,
    })
      .then((response) => {
        if (cancelled) return
        if (!response.member_votes_available) {
          setState({ status: 'unavailable' })
          return
        }
        setState({
          status: 'ready',
          defectors: response.defectors,
          partySplits: response.party_splits ?? dot.party_splits,
        })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [open, dot])

  if (!dot) return null

  const title = tightnessDotLabel(dot)
  const kindLabel = dot.kind === 'nominee' ? 'Nominee' : 'Bill'
  const splits =
    state.status === 'ready' && state.partySplits.length > 0
      ? state.partySplits
      : dot.party_splits

  return (
    <AnimatedSheet
      open={open}
      selectionKey={selectionKey}
      onClose={onClose}
      titleId={titleId}
      closeAriaLabel="Close vote defectors"
      panelClassName="tightness-sheet"
    >
      <header className="tightness-sheet-header">
        <p className="tightness-sheet-kicker">
          {kindLabel} · {dot.chamber}
        </p>
        <h2 id={titleId} className="tightness-sheet-title">
          {title}
        </h2>
        <p className="tightness-sheet-meta">
          {dot.yeas}–{dot.nays} · {cohesionLabel(dot.cohesion)} · {formatVoteDate(dot.vote_date)}
        </p>
        {dot.kind === 'nominee' && dot.position_title ? (
          <p className="tightness-sheet-role">{dot.position_title}</p>
        ) : null}
        {splits.length > 0 ? (
          <p className="tightness-sheet-splits">{formatPartySplits(splits)}</p>
        ) : null}
      </header>

      <section className="sheet-section" aria-label="Vote-level defectors">
        <h3 className="sheet-section-title">Who broke with their party</h3>
        <TightnessDefectorBody chamber={dot.chamber} state={state} />
      </section>
    </AnimatedSheet>
  )
}

function TightnessDefectorBody({
  chamber,
  state,
}: {
  chamber: string
  state: LoadState
}) {
  if (state.status === 'idle' || state.status === 'loading') {
    return <p className="sheet-muted">Loading party defectors…</p>
  }
  if (state.status === 'unavailable') {
    return <p className="sheet-muted">{MEMBER_VOTES_UNAVAILABLE}</p>
  }
  if (state.status === 'error') {
    return <p className="sheet-muted">{MEMBER_VOTES_ERROR}</p>
  }
  if (state.defectors.length === 0) {
    return <p className="sheet-muted">{noPartyDefectorsMessage(chamber)}</p>
  }

  return (
    <div className="tightness-sheet-groups">
      {groupDefectorsByParty(state.defectors, state.partySplits).map((group) => (
        <div key={`${group.party}-${group.position}`} className="tightness-sheet-group">
          <p className="tightness-sheet-group-summary">{group.summary}</p>
          <ul className="tightness-sheet-names">
            {group.members.map((member) => (
              <li key={member.bioguide_id}>
                <span className="tightness-sheet-name">{member.name}</span>
                <span className="tightness-sheet-member-meta">
                  {member.party}-{member.state}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
