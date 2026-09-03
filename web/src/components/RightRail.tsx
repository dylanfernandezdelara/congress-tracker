import type { SenateWaitingBill, TightnessDot } from '../api/types'
import { SenateWaitingList } from './SenateWaitingList'
import { TightnessStrip } from './TightnessStrip'

type RightRailProps = {
  house: TightnessDot[]
  senate: TightnessDot[]
  waiting: SenateWaitingBill[]
  selectedKey: string | null
  onSelectDot: (dot: TightnessDot) => void
  onOpenWaitingBill?: (billParam: string) => void
  loading: boolean
  error: string | null
  onRetry?: () => void
}

export function RightRail({
  house,
  senate,
  waiting,
  selectedKey,
  onSelectDot,
  onOpenWaitingBill,
  loading,
  error,
  onRetry,
}: RightRailProps) {
  return (
    <div className="sidebar-panel space-y-6">
      <TightnessStrip
        house={house}
        senate={senate}
        selectedKey={selectedKey}
        onSelect={onSelectDot}
        loading={loading}
        error={error}
        onRetry={onRetry}
      />
      <SenateWaitingList
        items={waiting}
        loading={loading}
        error={error}
        onRetry={onRetry}
        onOpenBill={onOpenWaitingBill}
      />
    </div>
  )
}
