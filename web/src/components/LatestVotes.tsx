import type { RecentVoteVM } from '../ui/homeViewModel'

interface Props {
  votes: RecentVoteVM[]
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function LatestVotes({ votes }: Props) {
  return (
    <div className="recentVotes">
      {votes.map((v) => (
        <div key={v.voteNumber} className="recentVoteRow">
          <div className="recentVoteRow__header">
            <div className="recentVoteRow__info">
              <p className="recentVoteRow__title">{v.title}</p>
              <p className="recentVoteRow__sub">
                Vote #{v.voteNumber} · {formatDate(v.date)} · {v.totalYea}–{v.totalNay}
              </p>
            </div>
            <span
              className={`recentVoteRow__badge ${v.passed ? 'recentVoteRow__badge--passed' : 'recentVoteRow__badge--rejected'}`}
            >
              {v.passed ? 'Passed' : 'Rejected'}
            </span>
          </div>

          {v.isPartyLine ? (
            <p className="recentVoteRow__partyLine">Party-line vote</p>
          ) : (
            <div className="recentVoteRow__crossovers">
              <span className="recentVoteRow__crossoverLabel">Crossed party line:</span>
              {v.crossovers.map((c, i) => (
                <span key={i} className="recentVoteRow__crossoverName">
                  <span
                    className="recentVoteRow__partyDot"
                    style={{ background: c.color }}
                  />
                  {c.name}
                  <span className="recentVoteRow__partyTag">({c.party})</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
