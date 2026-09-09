import { useId } from 'react'

import type { OgCardModel } from '@congress-tracker/shared/og-card'

import type { BillSharePayload } from '../utils/billDeepLink'
import { canUseWebShare } from '../utils/billDeepLink'
import { AnimatedSheet } from './AnimatedSheet'
import { OgCardPreview } from './OgCardPreview'

type BillShareSheetProps = {
  open: boolean
  selectionKey: number
  payload: BillSharePayload
  /** Preview of the link card; carries the quote when one is being shared. */
  card: OgCardModel
  copied: boolean
  onClose: () => void
  onShare: () => void
  onCopy: () => void
}

export function BillShareSheet({
  open,
  selectionKey,
  payload,
  card,
  copied,
  onClose,
  onShare,
  onCopy,
}: BillShareSheetProps) {
  const titleId = useId()
  const isQuote = card.quote !== null

  return (
    <AnimatedSheet
      open={open}
      selectionKey={selectionKey}
      onClose={onClose}
      titleId={titleId}
      closeAriaLabel="Close share preview"
      panelClassName="bill-share-sheet"
    >
      <header className="bill-share-sheet-header">
        <h2 id={titleId} className="bill-share-sheet-title">
          {isQuote ? 'Share this quote' : 'Share this bill'}
        </h2>
        <p className="bill-share-sheet-kicker">
          {isQuote
            ? 'The link opens on this passage. Preview the card, then share or copy.'
            : 'Preview what friends will see, then share or copy.'}
        </p>
      </header>

      <OgCardPreview model={card} />

      <div className="bill-share-preview">
        <p className="bill-share-preview-title">{payload.title}</p>
        <p className="bill-share-preview-body">{payload.text}</p>
        <p className="bill-share-preview-url">{payload.url}</p>
      </div>

      <div className="bill-share-sheet-actions">
        {canUseWebShare() ? (
          <button type="button" className="bill-share-sheet-share" onClick={onShare}>
            Share
          </button>
        ) : null}
        <button type="button" className="bill-share-sheet-copy" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </AnimatedSheet>
  )
}
