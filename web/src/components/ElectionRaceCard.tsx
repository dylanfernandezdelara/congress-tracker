import { fecCandidateUrl, raceTitle } from '@congress-tracker/shared/elections-2026/present'
import {
  isCompetitiveRace,
  type ElectionCandidate,
  type ElectionRace,
} from '@congress-tracker/shared/elections-2026/types'

import { formatVoteDate } from '../utils/billLabels'
import { MemberProfileTrigger } from './MemberProfileTrigger'

const PARTY_TONE: Record<ElectionCandidate['party_code'], string> = {
  D: 'election-party--d',
  R: 'election-party--r',
  I: 'election-party--i',
  L: 'election-party--other',
  G: 'election-party--other',
  Other: 'election-party--other',
}

const BALLOT_STATUS_LABEL: Record<ElectionCandidate['ballot_status'], string | null> = {
  active: null,
  withdrawn: 'Withdrew; still on the ballot',
  deceased: 'Died; still on the ballot',
}

function seedParty(code: ElectionCandidate['party_code']): string {
  return code === 'D' || code === 'R' ? code : 'I'
}

function CandidateRow({ candidate, state }: { candidate: ElectionCandidate; state: string }) {
  const status = BALLOT_STATUS_LABEL[candidate.ballot_status]
  const facts = [
    candidate.incumbent ? 'Incumbent' : null,
    candidate.current_office,
    status,
  ].filter((fact): fact is string => fact != null)

  return (
    <li className="election-candidate">
      <div className="election-candidate-head">
        <span className="election-candidate-name">{candidate.name}</span>
        <span className={`election-party ${PARTY_TONE[candidate.party_code]}`}>
          {candidate.parties.join(' · ')}
        </span>
      </div>
      {facts.length > 0 ? <p className="election-candidate-facts">{facts.join(' · ')}</p> : null}
      <div className="election-candidate-links">
        {candidate.bioguide_id ? (
          <MemberProfileTrigger
            seed={{
              bioguide_id: candidate.bioguide_id,
              name: candidate.name,
              party: seedParty(candidate.party_code),
              state,
            }}
            className="election-link"
          >
            Voting record
          </MemberProfileTrigger>
        ) : null}
        {candidate.fec_candidate_id ? (
          <a className="election-link" href={fecCandidateUrl(candidate.fec_candidate_id)} target="_blank" rel="noreferrer">
            FEC filings
          </a>
        ) : null}
        {candidate.website ? (
          <a className="election-link" href={candidate.website} target="_blank" rel="noreferrer">
            Campaign site
          </a>
        ) : null}
      </div>
    </li>
  )
}

export function ElectionRaceCard({ race }: { race: ElectionRace }) {
  const competitive = isCompetitiveRace(race)
  const tags = [race.open_seat ? 'Open seat' : null, race.special ? 'Special election' : null].filter(
    (tag): tag is string => tag != null,
  )

  return (
    <article className="election-race" aria-labelledby={`race-${race.id}`}>
      <header className="election-race-head">
        <h3 id={`race-${race.id}`} className="election-race-title">
          {raceTitle(race)}
        </h3>
        {tags.length > 0 ? <span className="election-race-tags">{tags.join(' · ')}</span> : null}
      </header>

      {race.rating ? (
        <p className={competitive ? 'election-rating election-rating--competitive' : 'election-rating'}>
          {race.rating.label}
          <span className="election-rating-source">
            {' · '}
            <a href={race.rating.source.url} target="_blank" rel="noreferrer">
              Sabato’s Crystal Ball
            </a>
            , {formatVoteDate(race.rating.rated_on)}
          </span>
        </p>
      ) : null}

      {race.note ? <p className="election-race-note">{race.note}</p> : null}

      <ul className="election-candidates">
        {race.candidates.map((candidate) => (
          <CandidateRow key={candidate.sort_name} candidate={candidate} state={race.state} />
        ))}
      </ul>
    </article>
  )
}
