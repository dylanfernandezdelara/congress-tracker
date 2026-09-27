import { useEffect, useId, useRef, useState } from 'react'
import { sendSummaryFeedback, type SummaryFeedbackKind } from '../api/client'

type Status = 'idle' | 'voted' | 'reporting' | 'sending' | 'reported' | 'error'

const storageKey = (bill: string) => `summary-feedback:${bill}`

function rememberedVote(bill: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(bill)) !== null
  } catch {
    return false
  }
}

function rememberVote(bill: string, kind: SummaryFeedbackKind): void {
  try {
    window.localStorage.setItem(storageKey(bill), kind)
  } catch {
    // Private mode or blocked storage: the reader may be asked again, which is fine.
  }
}

const ANNOUNCEMENTS: Partial<Record<Status, string>> = {
  voted: 'Thanks for the feedback.',
  reported: 'Thanks. We’ll check this summary.',
}

/** "Was this summary helpful?" plus a way to report a mistake, under a bill's plain-language summary. */
export function SummaryFeedback({ bill }: { bill: string }) {
  const [status, setStatus] = useState<Status>(() => (rememberedVote(bill) ? 'voted' : 'idle'))
  const [note, setNote] = useState('')
  const noteId = useId()
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const reportRef = useRef<HTMLButtonElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const returnFocus = useRef<'report' | 'status' | null>(null)
  const formOpen = status === 'reporting' || status === 'sending' || status === 'error'

  // Keep keyboard and screen-reader users in place as the row changes shape.
  useEffect(() => {
    if (status === 'reporting') noteRef.current?.focus()
    else if (returnFocus.current === 'report') reportRef.current?.focus()
    else if (returnFocus.current === 'status') statusRef.current?.focus()
    returnFocus.current = null
  }, [status])

  const vote = (kind: 'helpful' | 'unhelpful') => {
    setStatus('voted')
    rememberVote(bill, kind)
    // Optimistic: a lost vote is not worth interrupting the reader for.
    void sendSummaryFeedback({ bill, kind }).catch(() => undefined)
  }

  const report = async () => {
    setStatus('sending')
    const ok = await sendSummaryFeedback({ bill, kind: 'mistake', note }).catch(() => false)
    if (ok) returnFocus.current = 'status'
    setStatus(ok ? 'reported' : 'error')
  }

  const announcement = ANNOUNCEMENTS[status] ?? ''

  return (
    <div className="feed-row-feedback-block">
      {/* One live region that stays mounted, so each change of its text is announced. */}
      <p
        ref={statusRef}
        className={announcement ? 'feed-row-feedback' : 'sr-only'}
        role="status"
        tabIndex={-1}
      >
        {announcement}
      </p>

      {formOpen ? (
        <form
          className="feed-row-feedback-form"
          onSubmit={(event) => {
            event.preventDefault()
            void report()
          }}
        >
          <label htmlFor={noteId} className="feed-row-feedback-label">
            What&rsquo;s wrong with this summary?
          </label>
          <textarea
            ref={noteRef}
            id={noteId}
            className="feed-row-feedback-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Optional: what it gets wrong or leaves out"
          />
          <div className="feed-row-feedback-actions">
            <button type="submit" className="feed-row-feedback-button" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <button
              type="button"
              className="feed-row-feedback-button"
              onClick={() => {
                returnFocus.current = 'report'
                setStatus(rememberedVote(bill) ? 'voted' : 'idle')
              }}
            >
              Cancel
            </button>
            <span className="feed-row-feedback-error" role="alert">
              {status === 'error' ? 'Couldn’t send. Try again.' : ''}
            </span>
          </div>
        </form>
      ) : null}

      {status === 'idle' || status === 'voted' ? (
        <p className="feed-row-feedback">
          {status === 'idle' ? (
            <>
              <span>Was this summary helpful?</span>
              <button type="button" className="feed-row-feedback-button" onClick={() => vote('helpful')}>
                Yes
              </button>
              <button type="button" className="feed-row-feedback-button" onClick={() => vote('unhelpful')}>
                No
              </button>
            </>
          ) : null}
          <button
            ref={reportRef}
            type="button"
            className="feed-row-feedback-button"
            onClick={() => setStatus('reporting')}
          >
            Report a mistake
          </button>
        </p>
      ) : null}
    </div>
  )
}
