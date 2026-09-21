import { ChevronDownIcon, CopyIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { copyTextToClipboard } from '../utils/billDeepLink'
import {
  OpenIn,
  OpenInChatGPT,
  OpenInClaude,
  OpenInContent,
  OpenInItem,
  OpenInLabel,
  OpenInSeparator,
  OpenInTrigger,
} from './ai-elements/open-in-chat'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

/**
 * Visible label. The trigger sits in the composer toolbar, so "Open in ▾"
 * reads as "open this conversation in…" and does not collide with the
 * drawer's "Open chat" control, which stays in the header.
 */
export const BILL_CHAT_EXPORT_TRIGGER = 'Open in'
/** Accessible name: this hands the briefing to ChatGPT or Claude, not this pane. */
export const BILL_CHAT_EXPORT_NAME = 'Open this conversation in ChatGPT or Claude'
export const BILL_CHAT_EXPORT_HINT =
  'Opens ChatGPT or Claude with this bill’s briefing and your questions so far.'
export const BILL_CHAT_EXPORT_MENU_LABEL = 'Continue in another app'

type BillChatExportMenuProps = {
  query: string
}

export function BillChatExportMenu({ query }: BillChatExportMenuProps) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current)
    }
  }, [])

  return (
    <OpenIn query={query}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <OpenInTrigger>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="bill-chat-export-trigger"
                aria-label={BILL_CHAT_EXPORT_NAME}
              >
                {BILL_CHAT_EXPORT_TRIGGER}
                <ChevronDownIcon aria-hidden />
              </Button>
            </OpenInTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56">
          {BILL_CHAT_EXPORT_HINT}
        </TooltipContent>
      </Tooltip>
      <OpenInContent align="start">
        <OpenInLabel>{BILL_CHAT_EXPORT_MENU_LABEL}</OpenInLabel>
        <OpenInChatGPT />
        <OpenInClaude />
        <OpenInSeparator />
        <OpenInItem
          onSelect={() => {
            void copyTextToClipboard(query).then((ok) => {
              setCopied(ok)
              if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current)
              copiedTimer.current = window.setTimeout(() => setCopied(false), 1600)
            })
          }}
        >
          <CopyIcon />
          {copied ? 'Copied briefing' : 'Copy briefing'}
        </OpenInItem>
      </OpenInContent>
    </OpenIn>
  )
}
