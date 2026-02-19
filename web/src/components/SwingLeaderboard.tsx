import type { SwingFrequencyIndex, GatekeeperVM } from '../ui/homeViewModel'

interface Props {
  swingIndex: SwingFrequencyIndex
  gatekeepers: GatekeeperVM[]
}

const MAX_LEADERBOARD = 10

const DIRECTION_ARROW: Record<string, string> = {
  'mostly-yea': '\u2191yea',
  'mostly-nay': '\u2193nay',
  mixed: '',
}

export default function SwingLeaderboard({ swingIndex, gatekeepers }: Props) {
  const ranked = [...swingIndex.profiles.values()]
    .sort((a, b) => b.swingPct - a.swingPct || b.swingCount - a.swingCount)
    .slice(0, MAX_LEADERBOARD)

  return (
    <div className="swingLeaderboard">
      {ranked.map((profile, idx) => (
        <div key={profile.bioguideId} className="swingProfile">
          <div className="swingProfile__header">
            <span className="swingProfile__rank">{idx + 1}.</span>
            <span
              className="recentVoteRow__partyDot"
              style={{ background: profile.color }}
            />
            <span className="swingProfile__name">{profile.name}</span>
            <span className="swingProfile__party">
              ({profile.party}-{profile.state})
            </span>
            <span className="swingProfile__pct">
              {profile.swingPct}% swing rate
            </span>
          </div>
          {profile.topicBreakdown.length > 0 && (
            <div className="swingProfile__topics">
              {profile.topicBreakdown.slice(0, 5).map((t) => (
                <span key={t.topic} className="swingProfile__topicTag">
                  {t.topic} ({t.swingCount}{DIRECTION_ARROW[t.direction] ? ` ${DIRECTION_ARROW[t.direction]}` : ''})
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {gatekeepers.length > 0 && (
        <div className="gatekeeperSection">
          <p className="gatekeeperSection__heading">Gatekeepers</p>
          <p className="gatekeeperSection__sub">
            Senators who repeatedly cast decisive Nay votes on close Motion to Proceed votes, preventing bills from reaching debate.
          </p>
          {gatekeepers.map((g) => (
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
                {g.bills.join(' \u00B7 ')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
