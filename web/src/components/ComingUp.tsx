import type { UpcomingItemVM } from '../ui/homeViewModel'

interface Props {
  items: UpcomingItemVM[]
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function ComingUp({ items }: Props) {
  return (
    <div className="comingUp">
      {items.map((item) => (
        <div key={item.id} className="comingUpItem">
          <div className="comingUpItem__header">
            <span className={`comingUpItem__type comingUpItem__type--${item.type}`}>
              {item.type === 'floor' ? 'Floor' : 'Hearing'}
            </span>
            <span className="comingUpItem__date">{formatDate(item.date)}</span>
          </div>
          <p className="comingUpItem__title">{item.title}</p>
          <div className="comingUpItem__tags">
            {item.policyArea && (
              <span className="policyTag">{item.policyArea}</span>
            )}
            {item.billTitle && (
              <span className="comingUpItem__bill">{item.billTitle}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
