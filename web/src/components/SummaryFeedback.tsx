import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { sendSummaryFeedback, type SummaryFeedbackKind } from '../api/client'

type Report = 'closed' | 'open' | 'reported'
type Slot = 'ask' | 'end'

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

export type SummaryFeedbackState = {
  bill: string
  /** A vote is on record for this bill (this visit or an earlier one). */
  voted: boolean
  /** A vote cast in this view, so the thanks shows once rather than on every visit. */
  justVoted: boolean
  report: Report
  /** Where the report form opened: under the ask, or in the row at the end. */
  reportAt: Slot
  vote: (kind: 'helpful' | 'unhelpful') => void
  openReport: (at: Slot) => void
  closeReport: () => void
  reported: () => void
}

/**
 * One feedback state per summary, shared by the ask under "What it does" and the row at the end, so a vote in one
 * place is not asked for again in the other and only one report form is ever open.
 */
export function useSummaryFeedback(bill: string | null): SummaryFeedbackState | null {
  const [seenBill, setSeenBill] = useState(bill)
  const [voted, setVoted] = useState(() => (bill ? rememberedVote(bill) : false))
  const [justVoted, setJustVoted] = useState(false)
  const [report, setReport] = useState<Report>('closed')
  const [reportAt, setReportAt] = useState<Slot>('end')
  if (seenBill !== bill) {
    setSeenBill(bill)
    setVoted(bill ? rememberedVote(bill) : false)
    setJustVoted(false)
    setReport('closed')
  }

  const vote = useCallback(
    (kind: 'helpful' | 'unhelpful') => {
      if (!bill) return
      setVoted(true)
      setJustVoted(true)
      rememberVote(bill, kind)
      // Optimistic: a lost vote is not worth interrupting the reader for. The client logs failures for testers.
      void sendSummaryFeedback({ bill, kind })
    },
    [bill],
  )
  const openReport = useCallback((at: Slot) => {
    setReportAt(at)
    setReport('open')
  }, [])
  const closeReport = useCallback(() => setReport('closed'), [])
  const reported = useCallback(() => setReport('reported'), [])

  if (!bill) return null
  return { bill, voted, justVoted, report, reportAt, vote, openReport, closeReport, reported }
}

/** The note form for "Report a mistake". Focuses the note on open; keeps it when a send fails. */
function ReportForm({ feedback, onCancel, onSent }: { feedback: SummaryFeedbackState; onCancel: () => void; onSent: () => void }) {
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const noteId = useId()
  const noteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    noteRef.current?.focus()
  }, [])

  const send = async () => {
    setSending(true)
    const ok = await sendSummaryFeedback({ bill: feedback.bill, kind: 'mistake', note })
    setSending(false)
    if (ok) onSent()
    else setFailed(true)
  }

  return (
    <form
      className="feed-row-feedback-form"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
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
        <button type="submit" className="feed-row-feedback-button" disabled={sending}>
          {sending ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className="feed-row-feedback-button" onClick={onCancel}>
          Cancel
        </button>
        <span className="feed-row-feedback-error" role="alert">
          {failed ? 'Couldn’t send. Try again.' : ''}
        </span>
      </div>
    </form>
  )
}

/**
 * Keeps keyboard and screen-reader users in place as a slot changes shape: back to the opener on Cancel, onto the
 * thanks after a send.
 */
function useSlotFocus(feedback: SummaryFeedbackState, slot: Slot) {
  const openerRef = useRef<HTMLButtonElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const pending = useRef<'opener' | 'status' | null>(null)
  const { report } = feedback
  useEffect(() => {
    if (pending.current === 'opener') openerRef.current?.focus()
    else if (pending.current === 'status') statusRef.current?.focus()
    pending.current = null
  }, [report])
  const here = feedback.reportAt === slot
  return {
    openerRef,
    statusRef,
    formOpen: report === 'open' && here,
    reportedHere: report === 'reported' && here,
    cancel: () => {
      pending.current = 'opener'
      feedback.closeReport()
    },
    sent: () => {
      pending.current = 'status'
      feedback.reported()
    },
  }
}

const REPORTED = 'Thanks. We’ll check this summary.'

/**
 * "Was this clear? Yes / No" right under the summary, where readers are. After a vote it becomes a quiet "Thanks."
 * with "Report a mistake" beside it. Hidden once a vote from an earlier visit is on record.
 */
export function SummaryFeedbackAsk({ feedback }: { feedback: SummaryFeedbackState }) {
  const { voted, justVoted, report, vote } = feedback
  const { openerRef, statusRef, formOpen, reportedHere, cancel, sent } = useSlotFocus(feedback, 'ask')
  const announcement = reportedHere ? REPORTED : voted ? 'Thanks.' : ''

  // The pressed button is gone after a vote; keep focus on the thanks rather than the page body.
  useEffect(() => {
    if (justVoted) statusRef.current?.focus()
  }, [justVoted, statusRef])

  if (voted && !justVoted) return null

  return (
    <div className="feed-row-feedback-ask">
      <div className="feed-row-feedback-ask-line">
        <p
          ref={statusRef}
          role="status"
          tabIndex={-1}
          className={announcement ? 'feed-row-feedback-ask-text' : 'sr-only'}
        >
          {announcement}
        </p>
        {voted ? (
          report === 'closed' ? (
            <button
              ref={openerRef}
              type="button"
              className="feed-row-feedback-button"
              onClick={() => feedback.openReport('ask')}
            >
              Report a mistake
            </button>
          ) : null
        ) : (
          <>
            <span className="feed-row-feedback-ask-text">Was this clear?</span>
            <button type="button" className="feed-row-feedback-choice" onClick={() => vote('helpful')}>
              Yes
            </button>
            <button type="button" className="feed-row-feedback-choice" onClick={() => vote('unhelpful')}>
              No
            </button>
          </>
        )}
      </div>
      {formOpen ? <ReportForm feedback={feedback} onCancel={cancel} onSent={sent} /> : null}
    </div>
  )
}

/** "Report a mistake" at the end of a bill's plain-language summary. */
export function SummaryFeedback({ feedback }: { feedback: SummaryFeedbackState }) {
  const { openerRef, statusRef, formOpen, reportedHere, cancel, sent } = useSlotFocus(feedback, 'end')
  const announcement = reportedHere ? REPORTED : ''

  return (
    <div className="feed-row-feedback-block">
      {/* One live region that stays mounted, so the thanks is announced. */}
      <p
        ref={statusRef}
        className={announcement ? 'feed-row-feedback' : 'sr-only'}
        role="status"
        tabIndex={-1}
      >
        {announcement}
      </p>
      {formOpen ? <ReportForm feedback={feedback} onCancel={cancel} onSent={sent} /> : null}
      {feedback.report === 'closed' ? (
        <p className="feed-row-feedback">
          <button
            ref={openerRef}
            type="button"
            className="feed-row-feedback-button"
            onClick={() => feedback.openReport('end')}
          >
            Report a mistake
          </button>
        </p>
      ) : null}
    </div>
  )
}
