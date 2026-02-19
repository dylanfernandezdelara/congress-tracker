import type { BillTimelineVM } from '../ui/homeViewModel'

interface Props {
  bills: BillTimelineVM[]
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const STATUS_LABELS: Record<BillTimelineVM['finalStatus'], string> = {
  passed: 'Passed',
  rejected: 'Rejected',
  'in-progress': 'In progress',
}

const STATUS_CLASSES: Record<BillTimelineVM['finalStatus'], string> = {
  passed: 'recentVoteRow__badge--passed',
  rejected: 'recentVoteRow__badge--rejected',
  'in-progress': 'billCard__badge--progress',
}

const IMPACT_LABELS: Record<BillTimelineVM['significance'], string> = {
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Low impact',
}

const CONFIDENCE_LABELS: Record<BillTimelineVM['confidence'], string> = {
  high: 'High detail',
  medium: 'Medium detail',
  low: 'Limited detail',
}

function confidenceLabel(bill: BillTimelineVM): string {
  if (bill.richnessScore >= 60) return 'Concrete official detail'
  if (bill.richnessScore >= 30) return 'Some official detail'
  return CONFIDENCE_LABELS[bill.confidence]
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

function renderCard(bill: BillTimelineVM) {
  return (
    <article
      key={bill.groupKey}
      className={`billCard ${bill.finalStatus === 'rejected' ? 'billCard--rejected' : ''}`}
    >
      <div className="billCard__header">
        <div className="billCard__info">
          <div className="billCard__tags">
            <span className={policyTagClass(bill.categoryLabel)}>{bill.categoryLabel}</span>
            {bill.displayCode && <span className="billCodeTag">{bill.displayCode}</span>}
            <span className={`impactTag impactTag--${bill.significance}`}>{IMPACT_LABELS[bill.significance]}</span>
            <span className={`confidenceTag confidenceTag--${bill.confidence}`}>{confidenceLabel(bill)}</span>
          </div>
          <p className="billCard__title">{bill.displayTitle}</p>
          {bill.hasAnalysis && bill.significanceReason && (
            <p className="billCard__meta">{bill.significanceReason}</p>
          )}
        </div>
        <span className={`recentVoteRow__badge ${STATUS_CLASSES[bill.finalStatus]}`}>
          {STATUS_LABELS[bill.finalStatus]}
        </span>
      </div>

      <p className="billCard__next billCard__next--primary">
        <strong>What happens next:</strong> {bill.whatHappensNext}
      </p>

      <p className="billCard__meaning">
        <strong>What this means:</strong> {bill.meaningLine}
      </p>

      <p className="billCard__impact">
        <strong>{bill.confidence === 'low' ? 'Potential impact (limited information available):' : 'How this may affect you:'}</strong> {bill.personalImpact}
      </p>

      <p className="billCard__stateImpact">
        <strong>State and local signal:</strong> {bill.stateLocalImpact}
      </p>

      {bill.moneyFlows.length > 0 ? (
        <details className="billCard__money">
          <summary>Money committed and recipients</summary>
          <ul>
            {bill.moneyFlows.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </details>
      ) : bill.structuredRecipients.length > 0 ? (
        <p className="billCard__unknownCallout">
          <strong>Money committed and recipients:</strong> Recipients are named ({bill.structuredRecipients.slice(0, 3).map((r) => r.name).join(', ')}), but exact amounts are not specified in available official sources.
        </p>
      ) : (
        <p className="billCard__unknownCallout">
          <strong>Money committed and recipients:</strong> Not specified in the available official summary.
        </p>
      )}

      {bill.officialTitle && bill.officialTitle !== bill.displayTitle && (
        <details className="billCard__official">
          <summary>Official wording</summary>
          <p>{bill.officialTitle}</p>
        </details>
      )}

      {bill.hasAnalysis && bill.keyProvisions.length > 0 && (
        <details className="billCard__provisions">
          <summary>Key provisions</summary>
          <ul>
            {bill.keyProvisions.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </details>
      )}

      {bill.hasAnalysis && bill.hiddenProvisions && (
        <p className="billCard__hidden">
          <strong>Watch item:</strong> {bill.hiddenProvisions}
        </p>
      )}

      {bill.hasAnalysis && bill.affectedGroups.length > 0 && (
        <p className="billCard__meta">
          <strong>Most affected:</strong> {bill.affectedGroups.join(', ')}
        </p>
      )}

      {(bill.unknowns.length > 0 || bill.unknownReasons.length > 0) && (
        <details className="billCard__unknowns">
          <summary>What we still do not know</summary>
          <ul>
            {bill.unknownReasons.length > 0 ? (
              bill.unknownReasons.map((u, i) => (
                <li key={i}>
                  <strong>{u.category.replace('-', ' ')}:</strong> {u.reason}
                  {u.sources_checked.length > 0 ? ` (Checked: ${u.sources_checked.join(', ')})` : ''}
                </li>
              ))
            ) : (
              bill.unknowns.map((u, i) => <li key={i}>{u}</li>)
            )}
          </ul>
        </details>
      )}

      {bill.evidence.length > 0 && (
        <details className="billCard__evidence">
          <summary>Source evidence</summary>
          <ul>
            {bill.evidence.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </details>
      )}

      <div className="billCard__steps">
        {bill.steps.map((step, i) => (
          <div key={i} className="billStep">
            <span className={`billStep__chip ${step.passed ? 'billStep__chip--passed' : 'billStep__chip--failed'}`}>
              {step.label}
            </span>
            <span className="billStep__tally">
              <span className={step.isClose ? 'billStep__tally--close' : ''}>
                {step.totalYea}–{step.totalNay}
              </span>
              {step.isClose && (
                <span className="enrichedVote__marginBadge">margin {step.margin}</span>
              )}
            </span>
            <span className="billStep__date">{formatDate(step.date)}</span>
            {i < bill.steps.length - 1 && (
              <span className="billStep__arrow" aria-hidden="true">→</span>
            )}
          </div>
        ))}
      </div>

      {bill.steps.filter((s) => s.isClose && s.crossovers.length > 0).map((step, i) => (
        <div key={i} className="recentVoteRow__crossovers">
          <span className="recentVoteRow__crossoverLabel">
            {step.passed ? 'Crossed party line:' : 'Decisive Nay votes:'}
          </span>
          {step.crossovers.map((c, j) => (
            <span key={j} className="recentVoteRow__crossoverName">
              <span className="recentVoteRow__partyDot" style={{ background: c.color }} />
              {c.name}
              <span className="recentVoteRow__partyTag">({c.party})</span>
            </span>
          ))}
        </div>
      ))}
    </article>
  )
}

export default function BillTimeline({ bills }: Props) {
  const keyBills = bills.filter((b) => b.tier === 'key')
  const secondaryBills = bills.filter((b) => b.tier === 'secondary')

  return (
    <div className="billTimeline">
      {keyBills.map(renderCard)}

      {secondaryBills.length > 0 && (
        <details className="billTimeline__secondary">
          <summary>Also happening ({secondaryBills.length})</summary>
          <div className="billTimeline__secondaryList">
            {secondaryBills.map(renderCard)}
          </div>
        </details>
      )}
    </div>
  )
}
