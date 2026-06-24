import { partyCssClass, partyDisplayName } from '@congress-tracker/shared/party'

import { CURRENT_PRESIDENT } from '../constants/president'
import { useDocumentTheme } from '../hooks/useDocumentTheme'
import { partySeatColor } from '../utils/chamberPartyColors'

export function PresidentControlCard() {
  const theme = useDocumentTheme()
  const color = partySeatColor(CURRENT_PRESIDENT.party, theme)
  const partyClass = partyCssClass(CURRENT_PRESIDENT.party)

  return (
    <article
      className="chamber-card chamber-card--president"
      aria-label={`President ${CURRENT_PRESIDENT.name}, ${partyDisplayName(CURRENT_PRESIDENT.party)}, term ${CURRENT_PRESIDENT.termStart} to ${CURRENT_PRESIDENT.termEnd}`}
    >
      <header className="chamber-card-header">
        <h3 className="chamber-card-title">President</h3>
      </header>
      <div className="president-control-body">
        <svg
          className="president-seat-icon"
          width="52"
          height="52"
          viewBox="0 0 56 56"
          aria-hidden="true"
        >
          <rect x="8" y="32" width="40" height="8" rx="2" fill={color} />
          <rect x="12" y="24" width="32" height="10" rx="3" fill={color} opacity="0.9" />
          <rect x="22" y="12" width="12" height="14" rx="2" fill={color} opacity="0.75" />
        </svg>
        <div className="president-control-meta">
          <p className="president-control-name">{CURRENT_PRESIDENT.name}</p>
          <span className={`chamber-party-pill ${partyClass} president-party-pill`}>
            <span className="chamber-party-pill-label">
              {partyDisplayName(CURRENT_PRESIDENT.party)}
            </span>
          </span>
          <p className="president-control-term">
            {CURRENT_PRESIDENT.termStart} – {CURRENT_PRESIDENT.termEnd}
          </p>
        </div>
      </div>
    </article>
  )
}
