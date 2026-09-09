import {
  BILL_CHAT_MAX_SELECTION_CHARS,
  type BillChatEvidenceSource,
} from '@congress-tracker/shared/chat-api-types'

import { assertNever } from './assertNever'

const STARTER_CHIPS = ['What does this bill do?', 'Who is affected?'] as const
const KEY_POINT_CHIP_CHARS = 40
const SELECTION_CHIP_CHARS = 60

export function truncateAtWordBoundary(text: string, maxChars: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxChars) return trimmed
  const slice = trimmed.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > 12 ? slice.slice(0, lastSpace) : slice
  return `${cut.replace(/[.,;:]+$/, '')}…`
}

export function starterChipsFromKeyPoints(keyPoints: readonly string[] | undefined): string[] {
  const derived = (keyPoints ?? [])
    .map((point) => point.trim())
    .filter((point) => point.length > 0)
    .slice(0, 2)
    .map((point) => `Explain: ${truncateAtWordBoundary(point, KEY_POINT_CHIP_CHARS)}`)
  return [...STARTER_CHIPS, ...derived]
}

export function capSelection(text: string): string {
  if (text.length <= BILL_CHAT_MAX_SELECTION_CHARS) return text
  return `${text.slice(0, BILL_CHAT_MAX_SELECTION_CHARS - 1)}…`
}

export function selectionChipLabel(text: string): string {
  return truncateAtWordBoundary(text, SELECTION_CHIP_CHARS)
}

export function parseChatErrorMessage(error: Error | undefined): string | null {
  if (!error) return null
  try {
    const parsed: unknown = JSON.parse(error.message)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'message' in parsed &&
      typeof (parsed as { message: unknown }).message === 'string'
    ) {
      return (parsed as { message: string }).message
    }
  } catch {
    // Non-JSON transport errors use the generic copy.
  }
  return 'Chat is unavailable right now.'
}

export function evidenceSourceLabel(source: BillChatEvidenceSource): string {
  switch (source) {
    case 'digest':
      return 'Plain-English summary'
    case 'crs':
      return 'CRS summary'
    case 'bill_text':
      return 'Bill text'
    default:
      return assertNever(source)
  }
}

export function splitProseParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}
