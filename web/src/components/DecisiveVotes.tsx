import type { DecisiveVotesResult } from '../ui/homeViewModel'

interface Props {
  data: DecisiveVotesResult
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function DecisiveVotes({ data }: Props) {
  return (
    <div className="decisiveVotes">
      {data.type === 'featured' && data.featuredSenators.map((s) => (
        <div key={s.bioguideId} className="featuredSenator">
          <div className="featuredSenator__header">
            <span
              className="recentVoteRow__partyDot"
              style={{ background: s.color }}
            />
            <span className="featuredSenator__name">{s.name}</span>
            <span className="recentVoteRow__partyTag">
              ({s.party}-{s.state})
            </span>
          </div>
          <ul className="featuredSenator__reasons">
            {s.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      ))}

      {data.type === 'decisive' && data.decisiveVotes.map((v) => (
        <div key={v.voteNumber} className="decisiveVote">
          <div className="decisiveVote__header">
            <div className="decisiveVote__info">
              {v.policyArea && (
                <span className="policyTag">{v.policyArea}</span>
              )}
              <p className="decisiveVote__title">
                {v.billTitle ?? v.title}
              </p>
              {v.billSummary && (
                <p className="decisiveVote__summary">{v.billSummary}</p>
              )}
              <p className="decisiveVote__meta">
                {formatDate(v.date)} · {v.passed ? 'Passed' : 'Rejected'}{' '}
                <span className="enrichedVote__tally--close">
                  {v.totalYea}–{v.totalNay}
                </span>
              </p>
            </div>
          </div>
          <div className="decisiveVote__senators">
            <span className="decisiveVote__label">Swing votes:</span>
            {v.swingSenators.map((s, i) => (
              <span key={i} className="decisiveVote__senator">
                <span
                  className="recentVoteRow__partyDot"
                  style={{ background: s.color }}
                />
                <span className="decisiveVote__senatorName">{s.name}</span>
                <span className="recentVoteRow__partyTag">
                  ({s.party}-{s.state})
                </span>
                <span className="decisiveVote__voteCast">
                  voted {s.voteCast}
                </span>
              </span>
            ))}
          </div>
        </div>
      ))}

      {data.gatekeepers.length > 0 && (
        <div className="gatekeeperSection">
          <p className="gatekeeperSection__heading">Gatekeepers</p>
          <p className="gatekeeperSection__sub">
            Senators who repeatedly cast decisive Nay votes on close Motion to Proceed votes, preventing bills from reaching debate.
          </p>
          {data.gatekeepers.map((g) => (
            <div key={g.bioguideId} className="gatekeeper">
              <div className="gatekeeper__header">
                <span
                  className="recentVoteRow__partyDot"
                  style={{ background: g.color }}
                />
                <span className="gatekeeper__name">{g.name}</span>
                <span className="recentVoteRow__partyTag">
                  ({g.party}-{g.state})
                </span>
                <span className="gatekeeper__count">
                  blocked {g.blockedCount} bills
                </span>
              </div>
              <p className="gatekeeper__bills">
                {g.bills.join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
