/**
 * Shared contracts for `POST /chat/bill` — consumed by the worker (stream
 * producer) and the web client (`@ai-sdk/react` `useChat` consumer).
 *
 * Transport is the AI SDK UI Message Stream (SSE). Prose streams as ordinary
 * `text-*` parts. Every verified verbatim passage is emitted as a native
 * `source-document` part (so AI Elements `Sources` can list it) plus a
 * `data-quote` part carrying the text itself and the section label.
 */

/** Extra JSON body fields the web client sends alongside `messages`. */
export interface BillChatRequestBody {
  /** Canonical bill param, e.g. `119-hr-1`. */
  bill: string
  /** Text the reader selected in the detail panel ("Ask about this"). */
  selection?: string
}

/** Where a verified passage was found. Mirrors `BillQuoteSource` minus `answer`. */
export type BillChatEvidenceSource = 'digest' | 'crs' | 'bill_text'

/** Payload of a `data-quote` part. `sourceId` matches the sibling `source-document`. */
export interface BillChatQuoteData {
  sourceId: string
  /** Verbatim passage as stored in the evidence (display casing, collapsed whitespace). */
  text: string
  /** `Sec. 3. Definitions`, `Plain-English summary`, `CRS summary`. */
  section_label: string
  source: BillChatEvidenceSource
}

/**
 * Payload of the trailing `data-answer` part. `sig` is HMAC-SHA256 (hex) over
 * the bill param plus `text` using `CHAT_HMAC_SECRET` (see
 * `workers/.../chat/answer-signature.ts`); `POST /share/quote` verifies it for
 * the bill in the request before accepting a quote with `source: "answer"`, so
 * a signature cannot be replayed onto another bill. `sig` is null when the
 * secret is not configured, in which case answers cannot be shared as quotes.
 */
export interface BillChatAnswerData {
  /** Final prose of the assistant turn (verified passages excluded). */
  text: string
  sig: string | null
  /** Number of passages the model quoted that were not found verbatim in the evidence. */
  unverified_quotes: number
  /** True when the endpoint refused because the evidence did not cover the question. */
  refused: boolean
}

/** Error body for non-stream failures (`429`, `400`, `404`, `503`). */
export interface BillChatErrorResponse {
  error: BillChatError
  message: string
}

export type BillChatError =
  | 'bad_request'
  | 'bill_not_found'
  | 'rate_limited'
  | 'daily_limit'
  | 'chat_unavailable'

/** Keep the model context small: only the newest turns are sent to the LLM. */
export const BILL_CHAT_MAX_HISTORY_TURNS = 4
export const BILL_CHAT_MAX_QUESTION_CHARS = 600
export const BILL_CHAT_MAX_SELECTION_CHARS = 600

/** Placeholder rendered in place of a passage the model quoted but the evidence does not contain. */
export const BILL_CHAT_UNVERIFIED_PLACEHOLDER = '(could not verify this passage)'

/**
 * `errorText` of the UI-message-stream `error` part the worker writes when the
 * model call fails mid-stream (provider error, thrown stream, blank answer).
 * `useChat` surfaces it verbatim as `error.message`, so the web recognizes
 * this exact string and shows it instead of the generic transport copy.
 */
export const BILL_CHAT_STREAM_ERROR_TEXT = 'The chat service failed. Try again shortly.'

/** Shown when the transport failed before the worker could say anything (network, non-JSON body). */
export const BILL_CHAT_GENERIC_ERROR_TEXT = 'Chat is unavailable right now.'

/** Names of custom data parts; the web narrows `part.type === \`data-${name}\``. */
export const BILL_CHAT_DATA_PART_QUOTE = 'quote'
export const BILL_CHAT_DATA_PART_ANSWER = 'answer'
