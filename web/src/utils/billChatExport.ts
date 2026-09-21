export const BILL_CHAT_EXPORT_MAX_CHARS = 12_000

export type BillChatExportTurn = {
  role: 'user' | 'assistant'
  text: string
}

export type BillChatExportInput = {
  billLabel: string
  billId: string
  sourceUrl: string
  pageUrl: string
  headline?: string | null
  whatItDoes?: string | null
  keyPoints?: readonly string[] | null
  crsSummary?: string | null
  messages: readonly BillChatExportTurn[]
}

function clipExport(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const budget = maxChars - '\n\n[Briefing truncated.]'.length
  const slice = text.slice(0, Math.max(0, budget))
  const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'))
  const cut = lastBreak > 400 ? slice.slice(0, lastBreak) : slice
  return `${cut.trimEnd()}\n\n[Briefing truncated.]`
}

/**
 * Prompt handed to ChatGPT / Claude / the clipboard so a reader can keep
 * asking about the same bill in a tool they already use.
 */
export function buildBillChatExportPrompt(input: BillChatExportInput): string {
  const lines: string[] = [
    'You are helping me understand a U.S. Congress bill.',
    '',
    `Bill: ${input.billId} — ${input.billLabel}`,
    `Official text: ${input.sourceUrl}`,
    `Track Congress: ${input.pageUrl}`,
  ]

  const headline = input.headline?.trim()
  if (headline && headline !== input.billLabel) {
    lines.push(`Headline: ${headline}`)
  }

  const whatItDoes = input.whatItDoes?.trim()
  if (whatItDoes) {
    lines.push('', 'Plain-English summary:', whatItDoes)
  }

  const keyPoints = (input.keyPoints ?? []).map((point) => point.trim()).filter(Boolean)
  if (keyPoints.length > 0) {
    lines.push('', 'Key points:')
    for (const point of keyPoints) {
      lines.push(`- ${point}`)
    }
  }

  const crs = input.crsSummary?.trim()
  if (crs) {
    lines.push('', 'Official CRS summary:', crs)
  }

  const turns = input.messages.filter((turn) => turn.text.trim().length > 0)
  if (turns.length > 0) {
    lines.push('', 'Conversation so far:')
    for (const turn of turns) {
      const who = turn.role === 'user' ? 'User' : 'Assistant'
      lines.push('', `${who}:`, turn.text.trim())
    }
    lines.push(
      '',
      'Continue this conversation. Quote the bill when you make a claim. I want to keep learning about it.',
    )
  } else {
    lines.push(
      '',
      'Start by explaining what this bill does, who it affects, and what is still uncertain from the text above.',
    )
  }

  return clipExport(lines.join('\n'), BILL_CHAT_EXPORT_MAX_CHARS)
}
