import { useAsyncData } from '../hooks/useAsyncData'
import { fetchExecutiveAlerts } from '../api/executive'
import { CURRENT_PRESIDENT } from '../constants/president'
import { congressGovBillUrl } from '../utils/billLabels'
import { getBillColloquialName } from '../utils/executiveLabels'

export function ExecutiveAlertBanner() {
  const { data } = useAsyncData({
    deps: [],
    load: fetchExecutiveAlerts,
    mapError: () => '',
  })
  const alert = data?.alerts[0]
  if (!alert) return null

  const primaryBill = alert.linked_bills.find((bill) => bill.role === 'primary') ?? alert.linked_bills[0]
  const postedDate = new Date(alert.posted_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <aside className="executive-alert-banner" role="status" aria-live="polite">
      <span className="executive-alert-banner__label">Breaking</span>
      <p className="executive-alert-banner__copy">
        {alert.summary}
        {primaryBill ? (
          <>
            {' '}
            ·{' '}
            <a
              className="executive-alert-banner__bill-link congress-link"
              href={congressGovBillUrl(primaryBill.congress, primaryBill.type, primaryBill.number)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {getBillColloquialName(primaryBill)}
            </a>
          </>
        ) : null}
        <span className="executive-alert-banner__meta">
          {' '}
          · {CURRENT_PRESIDENT.name} · Truth Social · {postedDate}
        </span>
      </p>
      <div className="executive-alert-banner__actions">
        <a
          className="executive-alert-banner__link"
          href={alert.source_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View post
        </a>
        {alert.archive_url ? (
          <a
            className="executive-alert-banner__link executive-alert-banner__link--secondary"
            href={alert.archive_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Archive
          </a>
        ) : null}
      </div>
      <p className="executive-alert-banner__disclaimer">
        Informal statement — not recorded on Congress.gov.
      </p>
    </aside>
  )
}
