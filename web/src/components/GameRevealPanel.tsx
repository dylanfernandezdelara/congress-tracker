import type { GamePartySplit, GameRevealResponse } from '../api/types'
import { normalizeDigestBullets, normalizeDigestLead } from '@congress-tracker/shared/feed-content'
import { congressGovBillUrl, formatShortBillId, formatVoteDate } from '../utils/billLabels'

type GameRevealPanelProps = {
  reveal: GameRevealResponse
  guess: 'passed' | 'failed'
  wasCorrect: boolean
}

function VoteSplitBar({ yeas, nays }: { yeas: number; nays: number }) {
  const total = yeas + nays
  if (total === 0) {
    return <div className="game-split-bar game-split-bar--empty" />
  }

  return (
    <div className="game-split-bar" aria-hidden="true">
      {yeas > 0 ? <div className="game-split-bar-yea" style={{ flex: yeas }} /> : null}
      {nays > 0 ? <div className="game-split-bar-nay" style={{ flex: nays }} /> : null}
    </div>
  )
}

function PartySplitList({ splits }: { splits: GamePartySplit[] }) {
  if (splits.length === 0) return null

  return (
    <div className="game-party-split">
      <p className="game-party-split-label">Party breakdown</p>
      <ul className="game-party-split-list">
        {splits.map((split) => (
          <li key={split.party}>
            <span className="game-party-split-party">{split.party}</span>
            <span>
              {split.yeas}–{split.nays}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function GameRevealPanel({ reveal, guess, wasCorrect }: GameRevealPanelProps) {
  const billId = formatShortBillId(reveal.bill.type, reveal.bill.number)
  const billUrl = congressGovBillUrl(reveal.bill.congress, reveal.bill.type, reveal.bill.number)
  const outcomeLabel = reveal.correct === 'passed' ? 'Passed' : 'Failed'

  return (
    <section
      className={`game-reveal${wasCorrect ? ' game-reveal--correct' : ' game-reveal--wrong'}`}
      aria-live="polite"
    >
      <p
        className={`game-reveal-verdict${wasCorrect ? ' game-reveal-verdict--correct' : ' game-reveal-verdict--wrong'}`}
      >
        <span className="game-reveal-verdict-primary">{wasCorrect ? 'Correct' : 'Not quite'}</span>
        <span className="game-reveal-verdict-detail">
          You guessed {guess}. It {reveal.correct}.
        </span>
      </p>

      <div className="game-reveal-meta">
        <span className={`feed-row-badge feed-row-badge--${reveal.correct === 'passed' ? 'passed' : 'failed'}`}>
          {outcomeLabel}
        </span>
        <span className="feed-row-chip">{reveal.vote.chamber}</span>
        <span className="feed-row-chip feed-row-chip--bill">{billId}</span>
      </div>

      <p className="game-reveal-margin">
        {reveal.vote.yeas}–{reveal.vote.nays}
        {' · '}
        <time dateTime={reveal.vote.date}>{formatVoteDate(reveal.vote.date)}</time>
      </p>
      <VoteSplitBar yeas={reveal.vote.yeas} nays={reveal.vote.nays} />

      {reveal.party_split ? <PartySplitList splits={reveal.party_split} /> : null}

      {reveal.digest?.what_it_does ? (
        <div className="game-reveal-summary">
          <p>{normalizeDigestLead(reveal.digest.what_it_does)}</p>
          {normalizeDigestBullets(reveal.digest.key_points ?? []).length > 0 ? (
            <ul className="feed-row-summary-bullets">
              {normalizeDigestBullets(reveal.digest.key_points ?? []).map((point, index) => (
                <li key={`${index}-${point}`}>{point}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <a className="congress-link game-reveal-link" href={billUrl} target="_blank" rel="noreferrer">
        Read {billId} on Congress.gov
      </a>
    </section>
  )
}
