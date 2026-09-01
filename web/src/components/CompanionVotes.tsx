import type { FeedCompanionVote } from '../api/types'
import { formatVoteDate } from '../utils/billLabels'
import { cleanVoteQuestion } from '@congress-tracker/shared/vote-question'

/** Companion rolls tell readers what the chamber fought over before passage. */
export function CompanionVotes({ votes }: { votes: FeedCompanionVote[] }) {
  if (votes.length === 0) return null

  return (
    <div className="feed-row-companion-votes" data-feed-companion-votes>
      <p className="feed-row-defectors-label">Related floor votes</p>
      <ul className="feed-row-companion-list">
        {votes.map((vote) => (
          <li
            key={`${vote.chamber}-${vote.congress}-${vote.session}-${vote.roll_number}`}
            className="feed-row-companion-item"
          >
            <span className="feed-row-companion-question">{cleanVoteQuestion(vote.question)}</span>
            <span className="feed-row-companion-meta">
              {vote.result} · {vote.yeas}–{vote.nays} · {formatVoteDate(vote.date)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
