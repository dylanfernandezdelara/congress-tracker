import { useAsyncData } from '../hooks/useAsyncData'
import { fetchExecutiveAlerts } from '../api/executive'

export function ExecutiveAlertBanner() {
  const { data } = useAsyncData({
    deps: [],
    load: fetchExecutiveAlerts,
    mapError: () => '',
  })
  const alert = data?.alerts[0]
  if (!alert) return null

  return (
    <aside className="executive-alert-banner" role="status" aria-live="polite">
      <span className="executive-alert-banner__label">Breaking</span>
      <p className="executive-alert-banner__copy">
        {alert.summary}
        <span className="executive-alert-banner__meta">
          {' '}
          · Truth Social · {new Date(alert.posted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      </p>
      <a
        className="executive-alert-banner__link"
        href={alert.source_url}
        target="_blank"
        rel="noopener noreferrer"
      >
        View post
      </a>
      <p className="executive-alert-banner__disclaimer">
        Informal statement — not recorded on Congress.gov.
      </p>
    </aside>
  )
}
