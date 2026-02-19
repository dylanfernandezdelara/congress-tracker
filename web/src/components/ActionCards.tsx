import type { ActionCardVM } from '../ui/homeViewModel'

interface Props {
  cards: ActionCardVM[]
}

const STATUS_LABELS: Record<ActionCardVM['status'], string> = {
  passed: 'Passed',
  rejected: 'Rejected',
  'in-progress': 'In progress',
}

const PARTY_NAMES: Record<string, string> = { R: 'Republican', D: 'Democrat', I: 'Independent' }

function policyTagClass(area: string | null): string {
  if (!area) return 'policyTag'
  const lc = area.toLowerCase()
  if (lc.includes('health')) return 'policyTag policyTag--health'
  if (lc.includes('econ') || lc.includes('financ') || lc.includes('commerce') || lc.includes('tax')) return 'policyTag policyTag--econ'
  if (lc.includes('armed') || lc.includes('defense') || lc.includes('military') || lc.includes('veteran')) return 'policyTag policyTag--defense'
  if (lc.includes('immigra') || lc.includes('border')) return 'policyTag policyTag--immigration'
  if (lc.includes('government') || lc.includes('politic')) return 'policyTag policyTag--gov'
  if (lc.includes('transport')) return 'policyTag policyTag--transport'
  if (lc.includes('energy') || lc.includes('environment')) return 'policyTag policyTag--energy'
  if (lc.includes('education') || lc.includes('social') || lc.includes('welfare') || lc.includes('labor')) return 'policyTag policyTag--social'
  return 'policyTag'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ActionCards({ cards }: Props) {
  return (
    <div className="actionCards">
      {cards.map((card) => (
        <article key={card.id} className={`actionCard actionCard--${card.status}`}>
          <div className="actionCard__tagRow">
            <span className={policyTagClass(card.category)}>{card.category}</span>
            {card.billCode && <span className="actionCard__code">{card.billCode}</span>}
            <span className={`actionCard__status actionCard__status--${card.status}`}>
              {STATUS_LABELS[card.status]}
            </span>
          </div>
          <h3 className="actionCard__title">{card.title}</h3>
          <p className="actionCard__outcome">{card.outcome}</p>
          <p className="actionCard__context">{card.context}</p>
          <p className="actionCard__vote">
            {card.voteLine.label} &middot; {card.voteLine.yea}&ndash;{card.voteLine.nay}
            {card.voteLine.leadParty && (
              <>
                {' '}&middot;{' '}
                <span className="actionCard__partyDot" style={{ backgroundColor: card.voteLine.leadParty.color }} />
                {' '}{PARTY_NAMES[card.voteLine.leadParty.abbr] ?? card.voteLine.leadParty.abbr}-led
              </>
            )}
            {' '}&middot; {formatDate(card.voteLine.date)}
          </p>
          {card.isCloseVote && card.swingSenators.length > 0 && (
            <div className="actionCard__swing">
              <span className="actionCard__swingLabel">Swing votes</span>
              {card.swingSenators.map((s, i) => (
                <span key={i} className="actionCard__swingSenator">
                  <span className="recentVoteRow__partyDot" style={{ background: s.color }} />
                  <span className="actionCard__swingName">{s.name}</span>
                  <span className="actionCard__swingParty">({s.party}-{s.state})</span>
                  <span className="actionCard__swingCast">voted {s.voteCast}</span>
                  <span className="actionCard__swingPct">&middot; swing in {s.swingPct}% of close votes</span>
                </span>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
