import type { GamePartySplit, GameRevealResponse } from '../api/types'
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
      <p className={`game-reveal-verdict${wasCorrect ? ' game-reveal-verdict--correct' : ' game-reveal-verdict--wrong'}`}>
        {wasCorrect ? 'Correct' : 'Not quite'} — you guessed {guess}, it {reveal.correct}.
      </p>

      <div className="game-reveal-meta">
        <span className={`feed-row-badge feed-row-badge--${reveal.correct === 'passed' ? 'passed' : 'failed'}`}>
          {outcomeLabel}
        </span>
        <span className="feed-row-chip">{reveal.vote.chamber}</span>
        <span className="feed-row-chip feed-row-chip--bill">{billId}</span>
        <time className="feed-row-date" dateTime={reveal.vote.date}>
          {formatVoteDate(reveal.vote.date)}
        </time>
      </div>

      <p className="game-reveal-margin">
        Final tally: {reveal.vote.yeas}–{reveal.vote.nays} in the {reveal.vote.chamber}
      </p>
      <VoteSplitBar yeas={reveal.vote.yeas} nays={reveal.vote.nays} />

      {reveal.party_split ? <PartySplitList splits={reveal.party_split} /> : null}

      {reveal.digest?.what_it_does ? (
        <p className="game-reveal-summary">{reveal.digest.what_it_does}</p>
      ) : null}

      <a className="congress-link game-reveal-link" href={billUrl} target="_blank" rel="noreferrer">
        Read {billId} on Congress.gov
      </a>
    </section>
  )
}
