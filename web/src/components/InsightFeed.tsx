import type { InsightCardVM } from '../ui/homeViewModel'

interface Props {
  cards: InsightCardVM[]
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High confidence',
  medium: 'Moderate confidence',
  low: 'Low confidence',
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

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

function InferenceTag() {
  return <span className="insightCard__inferenceTag">Inference</span>
}

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  return (
    <span className={`insightCard__confidence insightCard__confidence--${level}`}>
      {CONFIDENCE_LABEL[level]}
    </span>
  )
}

export default function InsightFeed({ cards }: Props) {
  if (cards.length === 0) return null

  return (
    <div className="insightFeed">
      {cards.map((card) => (
        <article key={card.id} className={`insightCard insightCard--${card.status}`}>
          {/* Outcome strip */}
          <div className="insightCard__header">
            <div className="insightCard__tagRow">
              <span className={policyTagClass(card.category)}>{card.category}</span>
              {card.billCode && <span className="insightCard__code">{card.billCode}</span>}
              <span className={`insightCard__status insightCard__status--${card.status}`}>
                {card.statusLabel}
              </span>
            </div>
            <h3 className="insightCard__title">{card.title}</h3>
            <p className="insightCard__tally">
              {card.voteTally.label} &middot; {card.voteTally.yea}&ndash;{card.voteTally.nay}
              {' '}&middot; {formatDate(card.voteTally.date)}
            </p>
          </div>

          {/* Party positions panel */}
          {card.partyPositions.length > 0 && (
            <div className="insightCard__partyPanel">
              <h4 className="insightCard__sectionTitle">Party positions</h4>
              <div className="insightCard__partyRows">
                {card.partyPositions.map((pos) => (
                  <div key={pos.party} className="insightCard__partyRow">
                    <div className="insightCard__partyHeader">
                      <span className="insightCard__partyDot" style={{ backgroundColor: pos.color }} />
                      <span className="insightCard__partyName">{pos.partyLabel}</span>
                      <span className={`insightCard__stance insightCard__stance--${pos.stance}`}>
                        {pos.stanceLabel}
                      </span>
                      <ConfidenceBadge level={pos.confidence} />
                    </div>
                    {pos.evidencePoints.length > 0 && (
                      <ul className="insightCard__evidenceList">
                        {pos.evidencePoints.map((pt, i) => (
                          <li key={i} className="insightCard__evidenceItem">
                            <span className="insightCard__evidenceTag">Evidence</span> {pt}
                          </li>
                        ))}
                      </ul>
                    )}
                    {pos.inferredRationale.length > 0 && (
                      <ul className="insightCard__inferenceList">
                        {pos.inferredRationale.map((r, i) => (
                          <li key={i} className="insightCard__inferenceItem">
                            <InferenceTag /> {r}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Who is affected panel */}
          {card.beneficiaries.length > 0 && (
            <div className="insightCard__beneficiaryPanel">
              <h4 className="insightCard__sectionTitle">Who is affected</h4>
              <ul className="insightCard__beneficiaryList">
                {card.beneficiaries.map((b, i) => (
                  <li key={i} className="insightCard__beneficiaryItem">
                    <span className={`insightCard__effectBadge insightCard__effectBadge--${b.effect}`}>
                      {b.effectLabel}
                    </span>
                    {b.group}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Context / why it matters */}
          <p className="insightCard__context">{card.context}</p>
          <p className="insightCard__outcome">{card.outcome}</p>

          {/* Dissent module (crossover votes) */}
          {card.isCloseVote && card.crossoverSenators.length > 0 && (
            <div className="insightCard__dissent">
              <h4 className="insightCard__sectionTitle">Crossover votes</h4>
              {card.crossoverSenators.map((s, i) => (
                <span key={i} className="insightCard__crossover">
                  <span className="insightCard__partyDot" style={{ background: s.color }} />
                  <span className="insightCard__crossoverName">{s.name}</span>
                  <span className="insightCard__crossoverParty">({s.party}-{s.state})</span>
                  <span className="insightCard__crossoverCast">voted {s.voteCast}</span>
                </span>
              ))}
            </div>
          )}

          {/* Evidence footer */}
          <div className="insightCard__footer">
            {card.hasInference && <InferenceTag />}
            {card.analysisQuality && (
              <span className="insightCard__qualityNote">
                {card.analysisQuality.confidence_reason}
              </span>
            )}
            {!card.analysisQuality && !card.hasInference && (
              <span className="insightCard__qualityNote">
                Party positions derived from voting record only.
              </span>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
