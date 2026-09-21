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
import { PromptInputButton } from './ai-elements/prompt-input'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

// The trigger sits in the composer toolbar, so "Open in ▾" reads as "open
// this conversation in…"; the accessible name says where.
const TRIGGER_LABEL = 'Open in'
const TRIGGER_NAME = 'Open this conversation in ChatGPT or Claude'
const TRIGGER_HINT = 'Opens ChatGPT or Claude with this bill’s briefing and your questions so far.'
const MENU_LABEL = 'Continue in another app'

const COPIED_MS = 1600

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
              <PromptInputButton className="text-muted-foreground" aria-label={TRIGGER_NAME}>
                {TRIGGER_LABEL}
                <ChevronDownIcon aria-hidden />
              </PromptInputButton>
            </OpenInTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-56">
          {TRIGGER_HINT}
        </TooltipContent>
      </Tooltip>
      <OpenInContent align="start">
        <OpenInLabel>{MENU_LABEL}</OpenInLabel>
        <OpenInChatGPT />
        <OpenInClaude />
        <OpenInSeparator />
        <OpenInItem
          onSelect={() => {
            void copyTextToClipboard(query).then((ok) => {
              setCopied(ok)
              if (copiedTimer.current != null) window.clearTimeout(copiedTimer.current)
              copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS)
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
