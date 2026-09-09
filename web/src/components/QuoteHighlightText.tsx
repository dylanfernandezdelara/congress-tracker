import { findQuoteInText } from '../utils/quoteHighlight'

type QuoteHighlightTextProps = {
  text: string
  /** Quote to mark inside `text`; no-op when absent or not found. */
  quote?: string | null
  /** Adds the landing pulse so a shared quote catches the eye once. */
  landing?: boolean
}

/** Renders `text`, wrapping the first tolerant match of `quote` in a `<mark>`. */
export function QuoteHighlightText({ text, quote, landing = false }: QuoteHighlightTextProps) {
  const range = quote ? findQuoteInText(text, quote) : null
  if (!range) return <>{text}</>
  return (
    <>
      {text.slice(0, range.start)}
      <mark
        className={`quote-highlight${landing ? ' quote-highlight--landing' : ''}`}
        data-quote-highlight=""
      >
        {text.slice(range.start, range.end)}
      </mark>
      {text.slice(range.end)}
    </>
  )
}
