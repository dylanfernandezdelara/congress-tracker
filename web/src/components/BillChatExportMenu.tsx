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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

// The trigger sits in the composer toolbar, so "Open in ▾" reads as "open
// this conversation in…"; the accessible name says where.
const TRIGGER_LABEL = 'Open in'
const TRIGGER_NAME = 'Open this conversation in ChatGPT or Claude'
const TRIGGER_HINT = 'Opens ChatGPT or Claude with this bill’s briefing and your questions so far.'
const MENU_LABEL = 'Continue in another app'

const COPIED_MS = 1600

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_LABEL: Record<CopyState, string> = {
  idle: 'Copy briefing',
  copied: 'Copied briefing',
  failed: 'Could not copy',
}

type BillChatExportMenuProps = {
  /** Plain-text briefing handed to ChatGPT / Claude as the opening prompt. */
  briefing: string
}

export function BillChatExportMenu({ briefing }: BillChatExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  // Bumped when the menu closes, so a clipboard write still in flight cannot
  // report into the next open.
  const openGeneration = useRef(0)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      openGeneration.current += 1
      setCopyState('idle')
    }
  }

  // The confirmation closes the menu on its own; closing early (Escape, an
  // outside click) resets `copyState`, which clears this timer.
  useEffect(() => {
    if (copyState !== 'copied') return
    const timer = window.setTimeout(() => {
      setOpen(false)
      setCopyState('idle')
    }, COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copyState])

  return (
    <OpenIn query={briefing} open={open} onOpenChange={handleOpenChange}>
      {/* Own provider, like the vendored Message tooltips: the menu renders
          anywhere a bill detail mounts, not only under an app-level provider. */}
      <TooltipProvider>
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
      </TooltipProvider>
      <OpenInContent align="start">
        <OpenInLabel>{MENU_LABEL}</OpenInLabel>
        <OpenInChatGPT />
        <OpenInClaude />
        <OpenInSeparator />
        <OpenInItem
          // Radix closes the menu on select, which would unmount the result
          // label before anyone sees it. Hold the menu open for the
          // confirmation, then close it; a failure stays put for a retry.
          onSelect={(event) => {
            event.preventDefault()
            const generation = openGeneration.current
            void copyTextToClipboard(briefing).then((ok) => {
              if (generation === openGeneration.current) setCopyState(ok ? 'copied' : 'failed')
            })
          }}
        >
          <CopyIcon />
          {COPY_LABEL[copyState]}
        </OpenInItem>
      </OpenInContent>
    </OpenIn>
  )
}
