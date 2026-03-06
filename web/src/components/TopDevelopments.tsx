import type { HomepageSpotlightItem } from '../ui/homeViewModel'

interface Props {
  items: HomepageSpotlightItem[]
}

const STATUS_LABELS: Record<HomepageSpotlightItem['status'], string> = {
  passed: 'Passed',
  rejected: 'Rejected',
  'in-progress': 'In progress',
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function TopDevelopments({ items }: Props) {
  return (
    <ol className="topDevelopments">
      {items.map((item) => (
        <li key={item.id} className="topDevelopments__item">
          <div className="topDevelopments__header">
            <span className="topDevelopments__category">{item.category}</span>
            <span className={`topDevelopments__status topDevelopments__status--${item.status}`}>
              {STATUS_LABELS[item.status]}
            </span>
          </div>
          <h3 className="topDevelopments__title">
            {item.billCode ? `${item.billCode} · ` : ''}
            {item.title}
          </h3>
          <p className="topDevelopments__why">{item.whyNow}</p>
          <p className="topDevelopments__meta">
            {item.voteLabel} · {formatDate(item.date)}
          </p>
        </li>
      ))}
    </ol>
  )
}
