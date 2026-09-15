import type { ReactNode } from 'react'

import { useBillChatSession } from './BillChatLayout'
import { BillChatSection } from './BillChatSection'

export function BillChatPane({
  collapsed = false,
  headerActions,
}: {
  collapsed?: boolean
  headerActions?: ReactNode
}) {
  const session = useBillChatSession()
  if (!session) return null

  return (
    <BillChatSection
      item={session.item}
      pendingSelection={session.pendingSelection}
      onClearSelection={session.onClearSelection}
      onSharePassage={session.onSharePassage}
      onQuoteCreated={session.onQuoteCreated}
      collapsed={collapsed}
      headerActions={headerActions}
    />
  )
}
