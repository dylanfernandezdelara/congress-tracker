import type { NotableVoteEntry } from '../api/types'
import { partyCssClass, partyShortLabel } from '@congress-tracker/shared/party'
import { crossVoteHint } from '@congress-tracker/shared/notable-votes'
import {
  MEMBER_VOTES_UNAVAILABLE,
  noPartyDefectorsMessage,
} from '../constants/memberVotesCopy'
import { prefetchMemberProfile } from '../api/memberProfileCache'
import { MemberAvatar } from './MemberAvatar'
import type { MemberProfileSeed } from './MemberProfile'

type NotableVoteDefectorsProps = {
  entry: NotableVoteEntry
  onOpenProfile: (seed: MemberProfileSeed) => void
  emptyClassName?: string
}

export function NotableVoteDefectors({
  entry,
  onOpenProfile,
  emptyClassName = 'notable-vote-defectors-empty',
}: NotableVoteDefectorsProps) {
  if (entry.defectors.length > 0) {
    return (
      <ul className="notable-vote-defectors">
        {entry.defectors.map((defector) => (
          <li key={defector.bioguide_id} className="notable-vote-defector">
            <button
              type="button"
              className="notable-vote-defector-button"
              onClick={() => onOpenProfile(defector)}
              onMouseEnter={() => prefetchMemberProfile(defector.bioguide_id)}
              onFocus={() => prefetchMemberProfile(defector.bioguide_id)}
              aria-label={`Open profile for ${defector.name}`}
            >
              <MemberAvatar
                name={defector.name}
                photoUrl={defector.photo_url}
                variant="defector"
              />
              <span className="notable-vote-defector-copy">
                <span className="notable-vote-defector-name">{defector.name}</span>
                <span className={`notable-vote-defector-party ${partyCssClass(defector.party)}`}>
                  {partyShortLabel(defector.party)}-{defector.state}
                </span>
                <span className="notable-vote-defector-hint">
                  {crossVoteHint(defector.cross_vote_label)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  if (entry.member_votes_available === false) {
    return <p className={emptyClassName}>{MEMBER_VOTES_UNAVAILABLE}</p>
  }

  return <p className={emptyClassName}>{noPartyDefectorsMessage(entry.chamber)}</p>
}
