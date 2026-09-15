import { CopyIcon } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

/** Visible label — must not collide with the drawer “Open chat” peek control. */
export const BILL_CHAT_EXPORT_TRIGGER = 'Continue in…'
/** Accessible name: this hands the briefing to ChatGPT or Claude, not this pane. */
export const BILL_CHAT_EXPORT_NAME = 'Continue this bill in ChatGPT or Claude'
export const BILL_CHAT_EXPORT_HINT =
  'Opens ChatGPT or Claude with this bill’s briefing and your questions.'

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
      <TooltipProvider delayDuration={300}>
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
                </Button>
              </OpenInTrigger>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-56">
            {BILL_CHAT_EXPORT_HINT}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <OpenInContent align="end">
        <OpenInLabel>Continue this bill in</OpenInLabel>
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
