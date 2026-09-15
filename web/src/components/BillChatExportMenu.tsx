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
      <OpenInTrigger>
        <Button type="button" size="sm" variant="outline" className="bill-chat-export-trigger">
          Open in chat
        </Button>
      </OpenInTrigger>
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
