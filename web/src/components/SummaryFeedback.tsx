import { useId, useState } from 'react'
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

/** "Was this summary helpful?" plus a way to report a mistake, under a bill's plain-language summary. */
export function SummaryFeedback({ bill }: { bill: string }) {
  const [status, setStatus] = useState<Status>(() => (rememberedVote(bill) ? 'voted' : 'idle'))
  const [note, setNote] = useState('')
  const noteId = useId()

  const vote = (kind: 'helpful' | 'unhelpful') => {
    setStatus('voted')
    rememberVote(bill, kind)
    void sendSummaryFeedback({ bill, kind }).catch(() => undefined)
  }

  const report = async () => {
    setStatus('sending')
    const ok = await sendSummaryFeedback({ bill, kind: 'mistake', note }).catch(() => false)
    setStatus(ok ? 'reported' : 'error')
  }

  if (status === 'reported') {
    return <p className="feed-row-feedback" role="status">Thanks. We&rsquo;ll check this summary.</p>
  }

  if (status === 'reporting' || status === 'sending' || status === 'error') {
    return (
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
          <button type="button" className="feed-row-feedback-button" onClick={() => setStatus(rememberedVote(bill) ? 'voted' : 'idle')}>
            Cancel
          </button>
          {status === 'error' ? (
            <span className="feed-row-feedback-error" role="alert">
              Couldn&rsquo;t send. Try again.
            </span>
          ) : null}
        </div>
      </form>
    )
  }

  return (
    <p className="feed-row-feedback">
      {status === 'voted' ? (
        <span role="status">Thanks for the feedback.</span>
      ) : (
        <>
          <span>Was this summary helpful?</span>
          <button type="button" className="feed-row-feedback-button" onClick={() => vote('helpful')}>
            Yes
          </button>
          <button type="button" className="feed-row-feedback-button" onClick={() => vote('unhelpful')}>
            No
          </button>
        </>
      )}
      <button type="button" className="feed-row-feedback-button" onClick={() => setStatus('reporting')}>
        Report a mistake
      </button>
    </p>
  )
}
