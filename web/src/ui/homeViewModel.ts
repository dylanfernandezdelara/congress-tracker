import type {
  ActivityIndexResponse,
  AnalysisQuality,
  AmountEvidence,
  BenefitMapEntry,
  BillAnalysis,
  BillImpactEvidence,
  BillRef,
  LikelyReason,
  PartyPositionAnalysis,
  RecipientEvidence,
  SessionOverview,
  VoteLedger,
  VoteLedgerEntry,
} from '../api'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type VoteCast = 'yea' | 'nay' | 'present' | 'notVoting' | 'absent'

function classifyVote(raw: string): VoteCast {
  const lc = raw.toLowerCase()
  if (lc.includes('yea') || lc.includes('aye') || lc === 'yes') return 'yea'
  if (lc.includes('nay') || lc === 'no') return 'nay'
  if (lc.includes('present')) return 'present'
  return 'notVoting'
}

function partyColor(party: string): string {
  if (party === 'D') return '#2563eb'
  if (party === 'R') return '#dc2626'
  return '#7c3aed'
}

function partyMajorityForVote(
  entry: VoteLedgerEntry,
  partyMap: Map<string, string>,
): Map<string, VoteCast> {
  const tally = new Map<string, { yea: number; nay: number }>()
  for (const [bio, cast] of Object.entries(entry.member_votes)) {
    const party = partyMap.get(bio)
    if (!party) continue
    const cv = classifyVote(cast)
    if (cv !== 'yea' && cv !== 'nay') continue
    const t = tally.get(party) ?? { yea: 0, nay: 0 }
    if (cv === 'yea') t.yea++; else t.nay++
    tally.set(party, t)
  }
  const result = new Map<string, VoteCast>()
  for (const [party, t] of tally) {
    result.set(party, t.yea >= t.nay ? 'yea' : 'nay')
  }
  return result
}

// ---------------------------------------------------------------------------
// 1. Chamber Arc (attendance encoding)
// ---------------------------------------------------------------------------

export interface ArcSenator {
  bioguideId: string
  name: string
  party: string
  state: string
  color: string
  votesCast: number
  totalVotes: number
  attendanceRate: number
}

export function buildAttendanceArcVM(overview: SessionOverview): ArcSenator[] {
  const sorted = [...overview.senators].sort((a, b) => {
    const order = (p: string) => (p === 'D' ? 0 : p === 'I' ? 1 : 2)
    const pa = order(a.party)
    const pb = order(b.party)
    if (pa !== pb) return pa - pb
    return b.votes_cast - a.votes_cast
  })

  return sorted.map((s) => ({
    bioguideId: s.bioguide_id,
    name: s.name,
    party: s.party,
    state: s.state,
    color: partyColor(s.party),
    votesCast: s.votes_cast,
    totalVotes: overview.total_votes,
    attendanceRate: overview.total_votes > 0
      ? s.votes_cast / overview.total_votes
      : 1,
  }))
}

// ---------------------------------------------------------------------------
// 2. Defection Matrix
// ---------------------------------------------------------------------------

export interface MatrixRow {
  bioguideId: string
  name: string
  party: string
  state: string
  totalDefections: number
  color: string
  cells: MatrixCell[]
}

export interface MatrixCell {
  voteNumber: number
  defection: boolean
  cast: VoteCast
  absent: boolean
}

export interface MatrixColumn {
  voteNumber: number
  date: string
  title: string
  result: string
  totalDefections: number
}

export interface DefectionMatrixVM {
  rows: MatrixRow[]
  columns: MatrixColumn[]
}

const MIN_DEFECTIONS_FOR_MATRIX = 2

export function buildDefectionMatrixVM(
  ledger: VoteLedger,
  overview: SessionOverview,
): DefectionMatrixVM {
  const partyMap = new Map<string, string>()
  for (const s of overview.senators) partyMap.set(s.bioguide_id, s.party)

  const sortedEntries = [...ledger.entries].sort(
    (a, b) => a.vote_number - b.vote_number,
  )

  const qualifyingSenators = [...overview.senators]
    .filter((s) => s.party_defections >= MIN_DEFECTIONS_FOR_MATRIX)
    .sort((a, b) => b.party_defections - a.party_defections)

  const columns: MatrixColumn[] = sortedEntries.map((entry) => {
    const majority = partyMajorityForVote(entry, partyMap)
    let totalDefections = 0
    for (const [bio, cast] of Object.entries(entry.member_votes)) {
      const party = partyMap.get(bio)
      if (!party) continue
      const cv = classifyVote(cast)
      const partyMaj = majority.get(party)
      if (partyMaj && (cv === 'yea' || cv === 'nay') && cv !== partyMaj) {
        totalDefections++
      }
    }
    return {
      voteNumber: entry.vote_number,
      date: entry.vote_date,
      title: entry.title,
      result: entry.result,
      totalDefections,
    }
  })

  const rows: MatrixRow[] = qualifyingSenators.map((stat) => {
    const cells: MatrixCell[] = sortedEntries.map((entry) => {
      const raw = entry.member_votes[stat.bioguide_id]
      if (!raw) return { voteNumber: entry.vote_number, defection: false, cast: 'absent' as VoteCast, absent: true }
      const cv = classifyVote(raw)
      const majority = partyMajorityForVote(entry, partyMap)
      const partyMaj = majority.get(stat.party)
      const defection = partyMaj !== undefined && (cv === 'yea' || cv === 'nay') && cv !== partyMaj
      return { voteNumber: entry.vote_number, defection, cast: cv, absent: false }
    })

    return {
      bioguideId: stat.bioguide_id,
      name: stat.name,
      party: stat.party,
      state: stat.state,
      totalDefections: stat.party_defections,
      color: partyColor(stat.party),
      cells,
    }
  })

  return { rows, columns }
}

// ---------------------------------------------------------------------------
// 3. State Dumbbell
// ---------------------------------------------------------------------------

export interface StatePairVM {
  state: string
  senatorA: { name: string; party: string; color: string }
  senatorB: { name: string; party: string; color: string }
  agreementPct: number
  isMixedParty: boolean
}

export function buildStateDumbbellVM(
  ledger: VoteLedger,
  overview: SessionOverview,
): StatePairVM[] {
  const stateGroups = new Map<string, typeof overview.senators>()
  for (const s of overview.senators) {
    const list = stateGroups.get(s.state) ?? []
    list.push(s)
    stateGroups.set(s.state, list)
  }

  const pairs: StatePairVM[] = []

  for (const [state, senators] of stateGroups) {
    if (senators.length !== 2) continue
    const [a, b] = senators

    let agree = 0
    let total = 0
    for (const entry of ledger.entries) {
      const rawA = entry.member_votes[a.bioguide_id]
      const rawB = entry.member_votes[b.bioguide_id]
      if (!rawA || !rawB) continue
      const cvA = classifyVote(rawA)
      const cvB = classifyVote(rawB)
      if ((cvA !== 'yea' && cvA !== 'nay') || (cvB !== 'yea' && cvB !== 'nay')) continue
      total++
      if (cvA === cvB) agree++
    }

    const agreementPct = total > 0 ? Math.round((agree / total) * 100) : -1
    if (agreementPct < 0) continue

    pairs.push({
      state,
      senatorA: { name: a.name, party: a.party, color: partyColor(a.party) },
      senatorB: { name: b.name, party: b.party, color: partyColor(b.party) },
      agreementPct,
      isMixedParty: a.party !== b.party,
    })
  }

  pairs.sort((a, b) => a.agreementPct - b.agreementPct)
  return pairs
}

// ---------------------------------------------------------------------------
// 4. Shared crossover type
// ---------------------------------------------------------------------------

export interface Crossover {
  bioguideId: string
  name: string
  party: string
  state: string
  color: string
  voteCast: VoteCast
}

// ---------------------------------------------------------------------------
// 5. Shared helpers
// ---------------------------------------------------------------------------

const CLOSE_MARGIN_THRESHOLD = 5

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function firstSentence(text: string, maxLen = 180): string {
  const match = text.match(/^(.+?[.!?])(\s|$)/)
  const sentence = match ? match[1] : text
  if (sentence.length <= maxLen) return sentence
  return sentence.slice(0, maxLen).replace(/\s+\S*$/, '') + '…'
}

function cleanBillSummary(raw: string | undefined): string | null {
  if (!raw) return null
  const plain = stripHtml(raw)
  if (!plain) return null
  return firstSentence(plain)
}

function extractVoteNumberFromActivityId(id: string): number | null {
  const parts = id.split(':')
  const last = parts[parts.length - 1]
  const num = Number(last)
  return Number.isNaN(num) ? null : num
}

function buildBillLookup(
  activities: ActivityIndexResponse,
): Map<number, BillRef> {
  const map = new Map<number, BillRef>()
  for (const a of activities.activities) {
    if (a.type !== 'roll_call_vote' || !a.bill) continue
    const voteNum = extractVoteNumberFromActivityId(a.activity_id)
    if (voteNum !== null) map.set(voteNum, a.bill)
  }
  return map
}

function computeVoteTallies(entry: VoteLedgerEntry): { totalYea: number; totalNay: number } {
  let totalYea = 0
  let totalNay = 0
  for (const cast of Object.values(entry.member_votes)) {
    const cv = classifyVote(cast)
    if (cv === 'yea') totalYea++
    if (cv === 'nay') totalNay++
  }
  return { totalYea, totalNay }
}

function isPassed(result: string): boolean {
  const lc = result.toLowerCase()
  if (/failed|rejected|not agreed|not passed|disagreed|not invoked|not confirmed/.test(lc)) {
    return false
  }
  return /agreed to|agreed|passed|confirmed|invoked|adopted|approved/.test(lc)
}

// ---------------------------------------------------------------------------
// 6. Swing Frequency Index (session-wide per-senator per-topic swing stats)
// ---------------------------------------------------------------------------

export interface SwingTopicBreakdown {
  topic: string
  swingCount: number
  yeaCount: number
  nayCount: number
  direction: 'mostly-yea' | 'mostly-nay' | 'mixed'
}

export interface SwingProfile {
  bioguideId: string
  name: string
  party: string
  state: string
  color: string
  swingCount: number
  swingPct: number
  topicBreakdown: SwingTopicBreakdown[]
}

export interface SwingFrequencyIndex {
  totalCloseVotes: number
  profiles: Map<string, SwingProfile>
}

export function buildSwingFrequencyIndex(
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexResponse | null,
): SwingFrequencyIndex {
  const partyMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  const stateMap = new Map<string, string>()
  for (const s of overview.senators) {
    partyMap.set(s.bioguide_id, s.party)
    nameMap.set(s.bioguide_id, s.name)
    stateMap.set(s.bioguide_id, s.state)
  }

  const billLookup = activities ? buildBillLookup(activities) : new Map<number, BillRef>()

  let totalCloseVotes = 0
  const raw = new Map<string, { swingCount: number; topics: Map<string, { yea: number; nay: number }> }>()

  for (const entry of ledger.entries) {
    const { totalYea, totalNay } = computeVoteTallies(entry)
    const margin = Math.abs(totalYea - totalNay)
    if (margin > CLOSE_MARGIN_THRESHOLD) continue

    totalCloseVotes++
    const majority = partyMajorityForVote(entry, partyMap)
    const topic = billLookup.get(entry.vote_number)?.policy_area ?? entry.policy_area ?? 'Uncategorized'

    for (const [bio, cast] of Object.entries(entry.member_votes)) {
      const cv = classifyVote(cast)
      const party = partyMap.get(bio)
      if (!party) continue
      const partyMaj = majority.get(party)
      if (!partyMaj || (cv !== 'yea' && cv !== 'nay') || cv === partyMaj) continue

      let profile = raw.get(bio)
      if (!profile) {
        profile = { swingCount: 0, topics: new Map() }
        raw.set(bio, profile)
      }
      profile.swingCount++
      const topicTally = profile.topics.get(topic) ?? { yea: 0, nay: 0 }
      if (cv === 'yea') topicTally.yea++; else topicTally.nay++
      profile.topics.set(topic, topicTally)
    }
  }

  const profiles = new Map<string, SwingProfile>()
  for (const [bio, data] of raw) {
    const topicBreakdown: SwingTopicBreakdown[] = []
    for (const [topic, tally] of data.topics) {
      const direction: SwingTopicBreakdown['direction'] =
        tally.yea > tally.nay ? 'mostly-yea' : tally.nay > tally.yea ? 'mostly-nay' : 'mixed'
      topicBreakdown.push({
        topic,
        swingCount: tally.yea + tally.nay,
        yeaCount: tally.yea,
        nayCount: tally.nay,
        direction,
      })
    }
    topicBreakdown.sort((a, b) => b.swingCount - a.swingCount)

    profiles.set(bio, {
      bioguideId: bio,
      name: (nameMap.get(bio) ?? bio).split(',')[0],
      party: partyMap.get(bio) ?? '',
      state: stateMap.get(bio) ?? '',
      color: partyColor(partyMap.get(bio) ?? ''),
      swingCount: data.swingCount,
      swingPct: totalCloseVotes > 0 ? Math.round(data.swingCount / totalCloseVotes * 100) : 0,
      topicBreakdown,
    })
  }

  return { totalCloseVotes, profiles }
}

// ---------------------------------------------------------------------------
// 8. Bill-Centric Timeline (group votes by bill)
// ---------------------------------------------------------------------------

export type StepType = 'proceed' | 'cloture' | 'passage' | 'amendment' | 'table' | 'confirmation' | 'vote'

export interface TimelineStep {
  type: StepType
  label: string
  passed: boolean
  date: string
  totalYea: number
  totalNay: number
  margin: number
  isClose: boolean
  crossovers: Crossover[]
  partyBreakdown: Record<string, { yea: number; nay: number }>
}

type IssueType = 'bill' | 'nomination' | 'other'
type LifecycleStage = 'senate_only' | 'cross_chamber' | 'enacted' | 'unknown'
type ConfidenceLevel = 'high' | 'medium' | 'low'
type FinalStatus = 'passed' | 'rejected' | 'in-progress'
type SignificanceLevel = 'high' | 'medium' | 'low'

export interface BillTimelineVM {
  groupKey: string
  displayCode: string | null
  categoryLabel: string
  displayTitle: string
  meaningLine: string
  moneyFlows: string[]
  structuredRecipients: RecipientEvidence[]
  keyProvisions: string[]
  affectedGroups: string[]
  significance: SignificanceLevel
  steps: TimelineStep[]
  tier: 'key' | 'secondary'
  latestDate: string
  whatHappensNext: string
  careScore: number
  finalStatus: FinalStatus
  rawAnalysis: BillAnalysis | null
}

function classifyQuestion(question: string): StepType {
  const q = question.toLowerCase()
  if (q.includes('proceed')) return 'proceed'
  if (q.includes('cloture')) return 'cloture'
  if (q.includes('passage') || q.includes('pass the bill') || q.includes('joint resolution') || q.includes('concurrent resolution') || q.includes('concur')) return 'passage'
  if (q.includes('table')) return 'table'
  if (q.includes('amendment')) return 'amendment'
  if (q.includes('nomination') || q.includes('confirmation')) return 'confirmation'
  return 'vote'
}

const STEP_LABELS: Record<StepType, [string, string]> = {
  proceed: ['Proceeded', 'Proceed failed'],
  cloture: ['Cloture invoked', 'Cloture failed'],
  passage: ['Passed', 'Rejected'],
  amendment: ['Amendment adopted', 'Amendment rejected'],
  table: ['Tabled', 'Table motion failed'],
  confirmation: ['Confirmed', 'Rejected'],
  vote: ['Agreed to', 'Rejected'],
}

function detectIssueType(issue: string | undefined, title: string): 'bill' | 'nomination' | 'other' {
  if (!issue) {
    const lc = title.toLowerCase()
    if (lc.includes('confirmation') || lc.includes('nomination')) return 'nomination'
    return 'other'
  }
  if (/^PN\s/i.test(issue)) return 'nomination'
  return 'bill'
}

function decodeIssueLabel(issue: string | undefined): string | null {
  if (!issue) return null
  const trimmed = issue.trim()
  if (!trimmed) return null

  if (/^PN\s*\d+/i.test(trimmed)) {
    const number = trimmed.replace(/^PN\s*/i, '')
    return `Presidential Nomination ${number}`
  }

  const match = trimmed.match(/^([A-Za-z.\s]+)\s*(\d+)$/)
  if (!match) return trimmed

  const rawType = match[1].replace(/\s+/g, '').replace(/\.+/g, '.').toUpperCase()
  const number = match[2]
  const labelMap: Record<string, string> = {
    'H.R.': 'House Bill',
    'HR': 'House Bill',
    'S.': 'Senate Bill',
    'S': 'Senate Bill',
    'H.J.RES.': 'House Joint Resolution',
    'HJRES': 'House Joint Resolution',
    'S.J.RES.': 'Senate Joint Resolution',
    'SJRES': 'Senate Joint Resolution',
    'H.RES.': 'House Resolution',
    'HRES': 'House Resolution',
    'S.RES.': 'Senate Resolution',
    'SRES': 'Senate Resolution',
    'H.CON.RES.': 'House Concurrent Resolution',
    'HCONRES': 'House Concurrent Resolution',
    'S.CON.RES.': 'Senate Concurrent Resolution',
    'SCONRES': 'Senate Concurrent Resolution',
  }

  const normalized = rawType.endsWith('.') ? rawType : `${rawType}`
  const expanded = labelMap[normalized] ?? labelMap[normalized.replace(/\./g, '')]
  if (!expanded) return trimmed
  return `${expanded} ${number}`
}

function normalizeSignificance(value: BillAnalysis['significance'] | undefined): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

// LifecycleStage type alias defined above BillTimelineVM

function shiftIsoDate(dateStr: string, days: number): string {
  const parsed = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return dateStr
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function downgradeConfidence(
  value: 'high' | 'medium' | 'low',
  steps: number,
): 'high' | 'medium' | 'low' {
  if (steps <= 0) return value
  if (value === 'high') return steps > 1 ? 'low' : 'medium'
  if (value === 'medium') return 'low'
  return 'low'
}

function deriveEvidenceConfidence(
  richnessScore: number,
  evidenceCount: number,
  unknownCount: number,
): 'high' | 'medium' | 'low' {
  let level: 'high' | 'medium' | 'low' =
    richnessScore >= 70 ? 'high' : richnessScore >= 40 ? 'medium' : 'low'
  if (evidenceCount === 0) level = downgradeConfidence(level, 2)
  if (unknownCount >= 3) level = downgradeConfidence(level, 1)
  return level
}

function inferLifecycleStage(
  issueType: IssueType,
  billRef: BillRef | undefined,
  lastStep: TimelineStep,
): LifecycleStage {
  if (issueType === 'nomination') return 'senate_only'
  const latestActionText = billRef?.latest_action?.text?.toLowerCase() ?? ''
  const lawNumber = billRef?.law?.number?.trim()
  if (
    lawNumber
    || /became (public )?law|signed by president|signed into law|enacted/.test(latestActionText)
  ) {
    return 'enacted'
  }
  if (
    /house|presented to president|to the president|conference|enrolling|enrolled/.test(latestActionText)
    || (lastStep.type === 'passage' && lastStep.passed)
  ) {
    return 'cross_chamber'
  }
  if (latestActionText) return 'senate_only'
  return 'unknown'
}

function deriveFinalStatus(
  steps: TimelineStep[],
  lifecycleStage: LifecycleStage,
): FinalStatus {
  if (lifecycleStage === 'enacted') return 'passed'
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (step.type === 'passage' || step.type === 'confirmation') {
      return step.passed ? 'passed' : 'rejected'
    }
  }
  const lastStep = steps[steps.length - 1]
  if (!lastStep) return 'in-progress'
  if (!lastStep.passed && (lastStep.type === 'proceed' || lastStep.type === 'cloture')) {
    return 'rejected'
  }
  return 'in-progress'
}

function computeCareScore(input: {
  significance: SignificanceLevel
  finalStatus: FinalStatus
  evidenceConfidence: ConfidenceLevel
  hasCloseVote: boolean
  hasMoneySignal: boolean
  hasRecipientSignal: boolean
  hasStateSignal: boolean
  hasAffectedGroups: boolean
}): number {
  let score = input.significance === 'high' ? 40 : input.significance === 'medium' ? 25 : 10
  if (input.finalStatus !== 'in-progress') score += 15
  if (input.hasMoneySignal) score += 15
  if (input.hasRecipientSignal) score += 10
  if (input.hasStateSignal) score += 10
  if (input.hasAffectedGroups) score += 8
  if (input.hasCloseVote) score += 6
  if (input.evidenceConfidence === 'low') score -= 12
  return Math.max(0, Math.min(100, score))
}

function computePriorityScore(input: {
  careScore: number
  significance: SignificanceLevel
  finalStatus: FinalStatus
  latestDate: string
  referenceDate: string
}): number {
  let score = input.careScore
  if (input.significance === 'high') score += 12
  else if (input.significance === 'medium') score += 6
  if (input.finalStatus !== 'in-progress') score += 8
  const dayDelta = Math.max(
    0,
    Math.round(
      (new Date(`${input.referenceDate}T00:00:00Z`).getTime()
        - new Date(`${input.latestDate}T00:00:00Z`).getTime()) / 86_400_000,
    ),
  )
  score += Math.max(0, 10 - dayDelta)
  return score
}

function buildWhatHappensNext(
  issueType: IssueType,
  finalStatus: FinalStatus,
  lastStep: TimelineStep,
  lifecycleStage: LifecycleStage,
): string {
  if (finalStatus === 'passed') {
    if (lifecycleStage === 'enacted') {
      return 'The measure is law; next steps are agency implementation, guidance, and oversight.'
    }
    if (issueType === 'nomination' || lastStep.type === 'confirmation') {
      return 'Nomination is approved by the Senate and can move to appointment.'
    }
    if (lifecycleStage === 'cross_chamber' || lastStep.type === 'passage') {
      return 'Measure clears the Senate and typically moves to the House or final enactment steps.'
    }
    return 'Measure advances to the next legislative step.'
  }

  if (finalStatus === 'rejected') {
    if (lastStep.type === 'proceed' || lastStep.type === 'cloture') {
      return 'The Senate blocked progress, so leadership would need to bring it back for another attempt.'
    }
    return 'Measure failed in the Senate and is unlikely to advance without reconsideration.'
  }

  if (lastStep.type === 'proceed' || lastStep.type === 'cloture') {
    return 'This clears a procedural hurdle; final passage or confirmation votes may come next.'
  }
  return 'Further Senate votes or negotiations are likely before a final outcome.'
}

function simplifyOfficialSummary(summary: string): string {
  const plain = summary.trim()
  if (!plain) return plain
  const lc = plain.toLowerCase()
  if (lc.includes('appropriation') || lc.includes('appropriations')) {
    return 'Official summary references appropriations, but line-item recipients and amounts are not fully specified.'
  }
  if (lc.includes('disapproving the action of the district of columbia council')) {
    return 'Blocks a law passed by the D.C. Council from taking effect.'
  }
  if (lc.includes('motion to proceed') || lc.includes('cloture')) {
    return 'This is a procedural vote that determines whether the Senate can move the measure forward.'
  }
  return plain
}

const HEDGING_WITHOUT_DETAILS_RE = /\b(may|might|could|can)\b/i
const GENERIC_PHRASE_RE = /\b(sets funding levels|may influence services|based on available official summary details)\b/i

function hasConcreteSignal(text: string): boolean {
  return /(\$|\d{1,3}(,\d{3})+|\b\d+\b|million|billion|department|agency|program|grant|state|county|city)/i.test(text)
}

function sanitizePrimaryNarrative(text: string, fallback: string): string {
  const trimmed = text.trim()
  if (!trimmed) return fallback
  if (GENERIC_PHRASE_RE.test(trimmed) && !hasConcreteSignal(trimmed)) return fallback
  if (HEDGING_WITHOUT_DETAILS_RE.test(trimmed) && !hasConcreteSignal(trimmed)) return fallback
  return trimmed
}

function formatStructuredMoneyFlows(
  amounts: AmountEvidence[],
  recipients: RecipientEvidence[],
): string[] {
  const recipientName = recipients[0]?.name
  return amounts.slice(0, 6).map((amount) => {
    const value = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount.value_numeric)
    if (recipientName) return `${value} for ${recipientName}`
    return `${value} referenced in official evidence`
  })
}

function buildMeaningLine(
  issueType: IssueType,
  finalStatus: FinalStatus,
  lastStep: TimelineStep,
  analysisSummary: string | null,
  moneyFlows: string[],
  officialSummary: string | null,
): string {
  if (analysisSummary && moneyFlows.length > 0) {
    return sanitizePrimaryNarrative(
      `${analysisSummary} Key money move: ${moneyFlows[0]}`,
      'Official sources show the measure moved forward, but concrete impact detail remains limited.'
    )
  }
  if (analysisSummary) {
    return sanitizePrimaryNarrative(
      analysisSummary,
      'Official sources show Senate action, but detail remains limited.'
    )
  }
  if (officialSummary) {
    return sanitizePrimaryNarrative(
      simplifyOfficialSummary(officialSummary),
      'Official summary does not provide enough detail to describe concrete impact.'
    )
  }
  if (issueType === 'nomination') {
    return 'The Senate is voting on whether to approve a nominee for a federal position.'
  }
  if (finalStatus === 'rejected' && (lastStep.type === 'proceed' || lastStep.type === 'cloture')) {
    return 'The Senate blocked this measure before a final up-or-down vote on passage.'
  }
  if (lastStep.type === 'passage') {
    return 'This was the Senate’s final vote on whether to pass the measure.'
  }
  return 'This is a Senate vote related to moving or deciding a federal measure.'
}

function deriveDisplayTitle(entries: VoteLedgerEntry[], billTitle: string | null): string {
  if (billTitle) return billTitle
  const longestTitle = entries.reduce((a, b) => a.title.length >= b.title.length ? a : b)
  let title = longestTitle.title
  title = title
    .replace(/^(Motion to Invoke Cloture:\s*)/i, '')
    .replace(/^(Motion to Proceed to\s*)/i, '')
    .replace(/^(On the Cloture Motion\s*)/i, '')
    .replace(/^(On the Motion to Proceed\s*)/i, '')
    .trim()
  return title || longestTitle.title
}

function extractGroupKey(entry: VoteLedgerEntry): string {
  if (entry.issue) return entry.issue

  const title = entry.title.toLowerCase()
  const nameMatch = title.match(/confirmation:\s*(.+?)(?:,\s*of\b|$)/i)
    ?? entry.title.match(/cloture[:\s]+(.+?)(?:,\s*of\b|$)/i)
  if (nameMatch) return `nom:${nameMatch[1].trim().toLowerCase()}`

  return `standalone:${entry.vote_number}`
}

const DEFAULT_TOTAL_BILL_GROUPS = 10
const DEFAULT_KEY_BILL_GROUPS = 4

export interface BillTimelineBuildOptions {
  windowDays?: number
  referenceDate?: string
  totalBudget?: number
  keyBudget?: number
}

export function buildBillTimelineVM(
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexResponse | null,
  options: BillTimelineBuildOptions = {},
): BillTimelineVM[] {
  const referenceDate =
    normalizeIsoDate(options.referenceDate)
    ?? normalizeIsoDate(overview.latest_vote_date)
    ?? normalizeIsoDate(ledger.entries[0]?.vote_date)
    ?? new Date().toISOString().slice(0, 10)
  const windowDays = Math.max(1, Math.min(options.windowDays ?? 7, 30))
  const windowStart = shiftIsoDate(referenceDate, -(windowDays - 1))
  const eligibleEntries = ledger.entries.filter(
    (entry) => entry.vote_date >= windowStart && entry.vote_date <= referenceDate,
  )
  if (eligibleEntries.length === 0) return []

  const partyMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  const stateMap = new Map<string, string>()
  for (const s of overview.senators) {
    partyMap.set(s.bioguide_id, s.party)
    nameMap.set(s.bioguide_id, s.name)
    stateMap.set(s.bioguide_id, s.state)
  }

  const billLookup = activities ? buildBillLookup(activities) : new Map<number, BillRef>()

  const groups = new Map<string, VoteLedgerEntry[]>()
  for (const entry of eligibleEntries) {
    const key = extractGroupKey(entry)
    const list = groups.get(key) ?? []
    list.push(entry)
    groups.set(key, list)
  }

  const timelines: BillTimelineVM[] = []

  for (const [groupKey, entries] of groups) {
    entries.sort((a, b) => a.vote_number - b.vote_number)

    let billRef: BillRef | undefined
    for (const e of entries) {
      billRef = billLookup.get(e.vote_number)
      if (billRef) break
    }

    const issueType = detectIssueType(entries[0].issue, entries[0].title)
    const billTitle = billRef?.title ?? null
    const billSummary = cleanBillSummary(billRef?.summary)
    const policyArea = billRef?.policy_area ?? entries[0].policy_area ?? null
    const impactEvidence: BillImpactEvidence | undefined = billRef?.impact_evidence
    const analysis = billRef?.analysis
    const officialTitle = deriveDisplayTitle(entries, billTitle)
    const categoryLabel = analysis?.category?.trim()
      || policyArea
      || (issueType === 'nomination' ? 'Nomination' : 'Senate business')
    const significance = normalizeSignificance(analysis?.significance)
    const richnessScore = analysis?.richness_score ?? impactEvidence?.richness_score ?? 0
    const keyProvisions = (analysis?.key_provisions ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 4)
    const affectedGroups = (analysis?.affects ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 5)
    const structuredAmounts = (analysis?.structured_amounts ?? impactEvidence?.how_much ?? [])
      .slice(0, 6)
    const structuredRecipients = (analysis?.structured_recipients ?? impactEvidence?.who ?? [])
      .slice(0, 6)
    const analysisMoneyFlows = (analysis?.money_flows ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 6)
    const derivedMoneyFlows = formatStructuredMoneyFlows(structuredAmounts, structuredRecipients)
    const moneyFlows = (analysisMoneyFlows.length > 0 ? analysisMoneyFlows : derivedMoneyFlows)
      .filter((line) => hasConcreteSignal(line))
      .slice(0, 6)
    const unknownReasons = (analysis?.unknown_reasons ?? impactEvidence?.unknowns ?? []).slice(0, 6)
    const unknowns = (analysis?.unknowns ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 6)
    const normalizedUnknowns = unknowns.length > 0
      ? unknowns
      : unknownReasons.map((reason) => reason.reason).slice(0, 6)
    const evidence = (analysis?.evidence ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 4)
    const normalizedEvidence = evidence.length > 0
      ? evidence
      : (impactEvidence?.summary_evidence ?? []).slice(0, 4)
    const displayCode = decodeIssueLabel(entries[0].issue)

    const steps: TimelineStep[] = entries.map((entry) => {
      const stepType = classifyQuestion(entry.question || entry.title)
      const { totalYea, totalNay } = computeVoteTallies(entry)
      const margin = Math.abs(totalYea - totalNay)
      const isClose = margin <= CLOSE_MARGIN_THRESHOLD
      const passed = isPassed(entry.result)
      const labels = STEP_LABELS[stepType]
      const label = passed ? labels[0] : labels[1]

      const partyBreakdown: Record<string, { yea: number; nay: number }> = {}
      const crossovers: Crossover[] = []
      for (const [bio, cast] of Object.entries(entry.member_votes)) {
        const party = partyMap.get(bio)
        if (!party) continue
        const cv = classifyVote(cast)
        if (cv !== 'yea' && cv !== 'nay') continue
        const t = partyBreakdown[party] ?? { yea: 0, nay: 0 }
        if (cv === 'yea') t.yea++; else t.nay++
        partyBreakdown[party] = t
      }
      if (isClose) {
        const majority = partyMajorityForVote(entry, partyMap)
        for (const [bio, cast] of Object.entries(entry.member_votes)) {
          const cv = classifyVote(cast)
          const party = partyMap.get(bio)
          if (!party) continue
          const partyMaj = majority.get(party)
          if (partyMaj && (cv === 'yea' || cv === 'nay') && cv !== partyMaj) {
            const name = nameMap.get(bio) ?? bio
            crossovers.push({ bioguideId: bio, name: name.split(',')[0], party, state: stateMap.get(bio) ?? '', color: partyColor(party), voteCast: cv })
          }
        }
        crossovers.sort((a, b) => {
          if (a.party !== b.party) return a.party.localeCompare(b.party)
          return a.name.localeCompare(b.name)
        })
      }

      return { type: stepType, label, passed, date: entry.vote_date, totalYea, totalNay, margin, isClose, crossovers, partyBreakdown }
    })

    const lastStep = steps[steps.length - 1]
    if (!lastStep) continue
    const hasFailedProcedural = steps.some((s) => (s.type === 'proceed' || s.type === 'cloture') && !s.passed)
    const hasCloseVote = steps.some((s) => s.isClose)
    const statesMentioned = analysis?.states_mentioned ?? impactEvidence?.where.states_mentioned ?? []
    const lifecycleStage = inferLifecycleStage(issueType, billRef, lastStep)
    const finalStatus = deriveFinalStatus(steps, lifecycleStage)
    const evidenceConfidence = deriveEvidenceConfidence(
      richnessScore,
      normalizedEvidence.length,
      Math.max(unknownReasons.length, normalizedUnknowns.length),
    )
    const tierScore =
      (significance === 'high' ? 3 : significance === 'medium' ? 2 : 1)
      + (finalStatus === 'in-progress' ? 0 : 2)
      + (hasCloseVote ? 1 : 0)
      + (hasFailedProcedural ? 1 : 0)
      + (lifecycleStage === 'enacted' ? 2 : lifecycleStage === 'cross_chamber' ? 1 : 0)
    const tier: BillTimelineVM['tier'] = tierScore >= 5 ? 'key' : 'secondary'
    const whatHappensNext = buildWhatHappensNext(issueType, finalStatus, lastStep, lifecycleStage)
    const displayTitle = analysis?.plain_title?.trim()
      || billTitle
      || officialTitle
      || categoryLabel
    const meaningLine = buildMeaningLine(
      issueType,
      finalStatus,
      lastStep,
      analysis?.plain_summary?.trim() || null,
      moneyFlows,
      billSummary,
    )
    const careScore = computeCareScore({
      significance,
      finalStatus,
      evidenceConfidence,
      hasCloseVote,
      hasMoneySignal: moneyFlows.length > 0 || structuredAmounts.length > 0,
      hasRecipientSignal: structuredRecipients.length > 0,
      hasStateSignal: statesMentioned.length > 0,
      hasAffectedGroups: affectedGroups.length > 0,
    })

    timelines.push({
      groupKey,
      displayCode,
      categoryLabel,
      displayTitle,
      meaningLine,
      moneyFlows,
      structuredRecipients,
      keyProvisions,
      affectedGroups,
      significance,
      steps,
      tier,
      latestDate: entries[entries.length - 1].vote_date,
      whatHappensNext,
      careScore,
      finalStatus,
      rawAnalysis: analysis ?? null,
    })
  }

  const scored = timelines.map((item) => ({
    item,
    priority: computePriorityScore({
      careScore: item.careScore,
      significance: item.significance,
      finalStatus: item.finalStatus,
      latestDate: item.latestDate,
      referenceDate,
    }),
  }))
  scored.sort((a, b) => b.priority - a.priority || b.item.latestDate.localeCompare(a.item.latestDate))

  const totalBudget = Math.max(1, Math.min(options.totalBudget ?? DEFAULT_TOTAL_BILL_GROUPS, 20))
  const keyBudget = Math.max(1, Math.min(options.keyBudget ?? DEFAULT_KEY_BILL_GROUPS, totalBudget))
  const selected: Array<{ item: BillTimelineVM; priority: number }> = []
  selected.push(...scored.filter((entry) => entry.item.tier === 'key').slice(0, keyBudget))
  selected.push(
    ...scored
      .filter((entry) => entry.item.tier === 'secondary')
      .slice(0, Math.max(0, totalBudget - selected.length)),
  )
  if (selected.length < totalBudget) {
    const pickedKeys = new Set(selected.map((entry) => entry.item.groupKey))
    for (const entry of scored) {
      if (pickedKeys.has(entry.item.groupKey)) continue
      selected.push(entry)
      pickedKeys.add(entry.item.groupKey)
      if (selected.length >= totalBudget) break
    }
  }
  selected.sort((a, b) => b.priority - a.priority || b.item.latestDate.localeCompare(a.item.latestDate))
  return selected.map((entry) => entry.item)
}

// ---------------------------------------------------------------------------
// 8b. ActionCardVM -- flat, glanceable card projection
// ---------------------------------------------------------------------------

export interface ActionCardSwingSenator {
  name: string
  party: string
  state: string
  color: string
  voteCast: 'Yea' | 'Nay'
  swingPct: number
}

export interface ActionCardVM {
  id: string
  category: string
  billCode: string | null
  title: string
  outcome: string
  context: string
  status: 'passed' | 'rejected' | 'in-progress'
  voteLine: { label: string; yea: number; nay: number; date: string; leadParty: { abbr: string; color: string; outcome: string } | null }
  isCloseVote: boolean
  swingSenators: ActionCardSwingSenator[]
}

const HEDGING_CONTEXT_RE = /Official sources|limited detail|not fully specified|not specified|does not provide/i
const PROCEDURAL_FALLBACK_RE = /is a Senate vote related|is a procedural vote that determines|is voting on whether to approve a nominee|blocked this measure before a final|final vote on whether to pass/i

function buildContext(bill: BillTimelineVM): string {
  const parts: string[] = []

  if (bill.moneyFlows.length > 0) {
    parts.push(bill.moneyFlows.slice(0, 3).join('. '))
  }

  if (bill.keyProvisions.length > 0) {
    const concrete = bill.keyProvisions.filter((p) => hasConcreteSignal(p))
    if (concrete.length > 0) parts.push(concrete.slice(0, 2).join('. '))
  }

  if (parts.length === 0 && bill.structuredRecipients.length > 0) {
    const names = bill.structuredRecipients.slice(0, 4).map((r) => r.name)
    parts.push(`Directs funds to ${names.join(', ')}.`)
  }

  if (bill.affectedGroups.length > 0) {
    parts.push(`Most affects: ${bill.affectedGroups.slice(0, 3).join(', ')}.`)
  }

  if (parts.length > 0) return parts.join(' ')

  const ml = bill.meaningLine
  if (ml && !HEDGING_CONTEXT_RE.test(ml) && !PROCEDURAL_FALLBACK_RE.test(ml)) {
    return ml
  }

  const cat = bill.categoryLabel.toLowerCase()
  if (cat.includes('nomination')) return 'A Senate vote on a federal nomination.'
  if (cat === 'senate business') return 'A Senate procedural action.'
  return `A Senate action on ${cat} policy.`
}

function pickDecisiveStep(steps: TimelineStep[]): TimelineStep {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].type === 'passage' || steps[i].type === 'confirmation') return steps[i]
  }
  return steps[steps.length - 1]
}

function computeLeadParty(step: TimelineStep): { abbr: string; color: string; outcome: string } | null {
  const winningSide: 'yea' | 'nay' = step.passed ? 'yea' : 'nay'
  let bestParty: string | null = null
  let bestCount = 0
  for (const [party, tally] of Object.entries(step.partyBreakdown)) {
    const count = tally[winningSide]
    if (count > bestCount) {
      bestCount = count
      bestParty = party
    }
  }
  if (!bestParty) return null
  const outcome = step.passed
    ? step.type === 'confirmation' ? 'confirmation' : 'passage'
    : 'rejection'
  return { abbr: bestParty, color: partyColor(bestParty), outcome }
}

export function toActionCards(bills: BillTimelineVM[], swingIndex: SwingFrequencyIndex): ActionCardVM[] {
  return bills.map((bill) => {
    const step = pickDecisiveStep(bill.steps)
    const swingSenators: ActionCardSwingSenator[] = step.isClose
      ? step.crossovers.map((c) => {
          const profile = swingIndex.profiles.get(c.bioguideId)
          return {
            name: c.name,
            party: c.party,
            state: c.state,
            color: c.color,
            voteCast: c.voteCast === 'yea' ? 'Yea' as const : 'Nay' as const,
            swingPct: profile?.swingPct ?? 0,
          }
        })
      : []
    return {
      id: bill.groupKey,
      category: bill.categoryLabel,
      billCode: bill.displayCode,
      title: bill.displayTitle,
      outcome: bill.whatHappensNext,
      context: buildContext(bill),
      status: bill.finalStatus,
      voteLine: { label: step.label, yea: step.totalYea, nay: step.totalNay, date: step.date, leadParty: computeLeadParty(step) },
      isCloseVote: step.isClose,
      swingSenators,
    }
  })
}

// ---------------------------------------------------------------------------
// 8c. InsightCardVM -- party insight feed projection
// ---------------------------------------------------------------------------

export interface InsightPartyPosition {
  party: string
  partyLabel: string
  color: string
  stance: 'support' | 'oppose' | 'mixed'
  stanceLabel: string
  evidencePoints: string[]
  inferredRationale: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface InsightBeneficiary {
  group: string
  effect: 'benefit' | 'burden' | 'mixed'
  effectLabel: string
  rationale: string[]
}

export interface InsightLikelyReason {
  actor: string
  actorLabel: string
  category: string
  reason: string
  confidence: 'high' | 'medium' | 'low'
  inferenceLabel: 'Inference'
  evidenceLines: string[]
}

export interface InsightCardVM {
  id: string
  category: string
  billCode: string | null
  title: string
  status: 'passed' | 'rejected' | 'in-progress'
  statusLabel: string
  outcome: string
  context: string
  stepType: string
  voteTally: { yea: number; nay: number; label: string; date: string }
  partyPositions: InsightPartyPosition[]
  beneficiaries: InsightBeneficiary[]
  likelyReasons: InsightLikelyReason[]
  analysisQuality: AnalysisQuality | null
  hasInference: boolean
  isCloseVote: boolean
  crossoverSenators: ActionCardSwingSenator[]
}

const STANCE_LABELS: Record<string, string> = {
  support: 'Supported',
  oppose: 'Opposed',
  mixed: 'Split',
}

const EFFECT_LABELS: Record<string, string> = {
  benefit: 'Benefits',
  burden: 'Harms',
  mixed: 'Mixed impact',
}

const PARTY_LABEL_MAP: Record<string, string> = {
  D: 'Democrats',
  R: 'Republicans',
  I: 'Independents',
}

function derivePartyPositionsFromVote(step: TimelineStep): InsightPartyPosition[] {
  const positions: InsightPartyPosition[] = []
  for (const [party, tally] of Object.entries(step.partyBreakdown)) {
    const total = tally.yea + tally.nay
    if (total === 0) continue
    const yeaPct = tally.yea / total
    let stance: 'support' | 'oppose' | 'mixed'
    if (yeaPct >= 0.7) stance = step.passed ? 'support' : 'oppose'
    else if (yeaPct <= 0.3) stance = step.passed ? 'oppose' : 'support'
    else stance = 'mixed'
    positions.push({
      party,
      partyLabel: PARTY_LABEL_MAP[party] ?? party,
      color: partyColor(party),
      stance,
      stanceLabel: STANCE_LABELS[stance],
      evidencePoints: [`${tally.yea} voted Yea, ${tally.nay} voted Nay`],
      inferredRationale: [],
      confidence: total >= 10 ? 'high' : 'medium',
    })
  }
  positions.sort((a, b) => {
    const order: Record<string, number> = { D: 0, R: 1, I: 2 }
    return (order[a.party] ?? 3) - (order[b.party] ?? 3)
  })
  return positions
}

function mergeAnalysisPositions(
  votePositions: InsightPartyPosition[],
  analysisPositions: PartyPositionAnalysis[] | undefined,
): InsightPartyPosition[] {
  if (!analysisPositions || analysisPositions.length === 0) return votePositions
  const merged = [...votePositions]
  for (const ap of analysisPositions) {
    const existing = merged.find((p) => p.party === ap.party)
    if (existing) {
      if (ap.evidence_points.length > 0) {
        existing.evidencePoints.push(...ap.evidence_points)
      }
      if (ap.inferred_rationale.length > 0) {
        existing.inferredRationale = ap.inferred_rationale
      }
      if (ap.confidence === 'high' && existing.confidence !== 'high') {
        existing.confidence = ap.confidence
      }
    }
  }
  return merged
}

const BENEFICIARY_RATIONALE_MAX_LINES = 2
const BENEFICIARY_RATIONALE_MAX_CHARS = 180
const LIKELY_REASON_MAX_LINES = 5
const LIKELY_REASON_EVIDENCE_MAX_LINES = 2
const LIKELY_REASON_TEXT_MAX_CHARS = 220

function truncateReasoning(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const sliced = text.slice(0, maxChars).trimEnd()
  const compact = sliced.replace(/\s+\S*$/, '').trimEnd()
  return `${compact || sliced}...`
}

function deriveBeneficiaryRationale(entry: BenefitMapEntry): string[] {
  const rationale: string[] = []
  const seen = new Set<string>()
  for (const ref of entry.evidence_refs) {
    const quote = ref.quote?.trim()
    const sourceRef = ref.source_ref?.trim()
    const candidate = quote && quote.length > 0
      ? quote
      : sourceRef && sourceRef.length > 0
        ? `Source: ${sourceRef}`
        : ''
    if (!candidate) continue
    const dedupeKey = candidate.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!dedupeKey || seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    rationale.push(truncateReasoning(candidate, BENEFICIARY_RATIONALE_MAX_CHARS))
    if (rationale.length >= BENEFICIARY_RATIONALE_MAX_LINES) break
  }
  return rationale
}

function formatReasonCategory(category: LikelyReason['category']): string {
  if (!category) return 'Other'
  return category.charAt(0).toUpperCase() + category.slice(1)
}

function deriveLikelyReasonEvidence(refs: LikelyReason['evidence_refs']): string[] {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    const quote = ref.quote?.trim()
    const sourceRef = ref.source_ref?.trim()
    const candidate = quote && quote.length > 0 ? quote : sourceRef ? `Source: ${sourceRef}` : ''
    if (!candidate) continue
    const dedupeKey = candidate.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!dedupeKey || seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    lines.push(truncateReasoning(candidate, BENEFICIARY_RATIONALE_MAX_CHARS))
    if (lines.length >= LIKELY_REASON_EVIDENCE_MAX_LINES) break
  }
  return lines
}

function deriveLikelyReasons(analysis: BillAnalysis | undefined): InsightLikelyReason[] {
  const reasons = analysis?.likely_reasons ?? []
  if (reasons.length === 0) return []
  const out: InsightLikelyReason[] = []
  const seen = new Set<string>()
  for (const reason of reasons) {
    const text = reason.reason.trim()
    if (!text) continue
    const dedupeKey = `${reason.actor}:${text}`.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push({
      actor: reason.actor,
      actorLabel: PARTY_LABEL_MAP[reason.actor] ?? reason.actor,
      category: formatReasonCategory(reason.category),
      reason: truncateReasoning(text, LIKELY_REASON_TEXT_MAX_CHARS),
      confidence: reason.confidence,
      inferenceLabel: 'Inference',
      evidenceLines: deriveLikelyReasonEvidence(reason.evidence_refs),
    })
    if (out.length >= LIKELY_REASON_MAX_LINES) break
  }
  return out
}

function deriveBeneficiaries(
  bill: BillTimelineVM,
  benefitMap: BenefitMapEntry[] | undefined,
): InsightBeneficiary[] {
  if (benefitMap && benefitMap.length > 0) {
    return benefitMap.slice(0, 4).map((entry) => ({
      group: entry.group,
      effect: entry.expected_effect,
      effectLabel: EFFECT_LABELS[entry.expected_effect] ?? 'Mixed impact',
      rationale: deriveBeneficiaryRationale(entry),
    }))
  }
  const groups: InsightBeneficiary[] = []
  for (const r of bill.structuredRecipients.slice(0, 3)) {
    groups.push({ group: r.name, effect: 'benefit', effectLabel: EFFECT_LABELS.benefit, rationale: [] })
  }
  for (const a of bill.affectedGroups.slice(0, 2)) {
    if (!groups.some((g) => g.group === a)) {
      groups.push({ group: a, effect: 'mixed', effectLabel: EFFECT_LABELS.mixed, rationale: [] })
    }
  }
  return groups.slice(0, 4)
}

const STATUS_LABEL_MAP: Record<string, string> = {
  passed: 'Passed',
  rejected: 'Rejected',
  'in-progress': 'In progress',
}

export function toInsightCards(bills: BillTimelineVM[], swingIndex: SwingFrequencyIndex): InsightCardVM[] {
  return bills.map((bill) => {
    const step = pickDecisiveStep(bill.steps)
    const analysis = findBillAnalysis(bill)
    const votePositions = derivePartyPositionsFromVote(step)
    const partyPositions = mergeAnalysisPositions(votePositions, analysis?.party_positions)
    const beneficiaries = deriveBeneficiaries(bill, analysis?.benefit_map)
    const likelyReasons = deriveLikelyReasons(analysis ?? undefined)
    const analysisQuality = analysis?.analysis_quality ?? null
    const hasInference =
      partyPositions.some((p) => p.inferredRationale.length > 0) ||
      likelyReasons.length > 0

    const swingSenators: ActionCardSwingSenator[] = step.isClose
      ? step.crossovers.map((c) => {
          const profile = swingIndex.profiles.get(c.bioguideId)
          return {
            name: c.name,
            party: c.party,
            state: c.state,
            color: c.color,
            voteCast: c.voteCast === 'yea' ? 'Yea' as const : 'Nay' as const,
            swingPct: profile?.swingPct ?? 0,
          }
        })
      : []

    return {
      id: bill.groupKey,
      category: bill.categoryLabel,
      billCode: bill.displayCode,
      title: bill.displayTitle,
      status: bill.finalStatus,
      statusLabel: STATUS_LABEL_MAP[bill.finalStatus] ?? bill.finalStatus,
      outcome: bill.whatHappensNext,
      context: buildContext(bill),
      stepType: step.type,
      voteTally: { yea: step.totalYea, nay: step.totalNay, label: step.label, date: step.date },
      partyPositions,
      beneficiaries,
      likelyReasons,
      analysisQuality,
      hasInference,
      isCloseVote: step.isClose,
      crossoverSenators: swingSenators,
    }
  })
}

function findBillAnalysis(bill: BillTimelineVM): BillAnalysis | null {
  return bill.rawAnalysis
}

// ---------------------------------------------------------------------------
// 9. Gatekeeper Analysis (senators who kill bills at Proceed stage)
// ---------------------------------------------------------------------------

export interface GatekeeperVM {
  bioguideId: string
  name: string
  party: string
  state: string
  color: string
  blockedCount: number
  bills: string[]
}

export function buildGatekeepersVM(
  ledger: VoteLedger,
  overview: SessionOverview,
): GatekeeperVM[] {
  const partyMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  const stateMap = new Map<string, string>()
  for (const s of overview.senators) {
    partyMap.set(s.bioguide_id, s.party)
    nameMap.set(s.bioguide_id, s.name)
    stateMap.set(s.bioguide_id, s.state)
  }

  const nayTally = new Map<string, string[]>()

  for (const entry of ledger.entries) {
    const q = (entry.question || entry.title).toLowerCase()
    if (!q.includes('proceed')) continue

    const { totalYea, totalNay } = computeVoteTallies(entry)
    const margin = Math.abs(totalYea - totalNay)
    if (margin > CLOSE_MARGIN_THRESHOLD) continue
    if (isPassed(entry.result)) continue

    const billLabel = entry.issue ?? entry.title.slice(0, 60)

    for (const [bio, cast] of Object.entries(entry.member_votes)) {
      const cv = classifyVote(cast)
      if (cv !== 'nay') continue
      const list = nayTally.get(bio) ?? []
      list.push(billLabel)
      nayTally.set(bio, list)
    }
  }

  const gatekeepers: GatekeeperVM[] = []
  for (const [bio, bills] of nayTally) {
    if (bills.length < 2) continue
    gatekeepers.push({
      bioguideId: bio,
      name: (nameMap.get(bio) ?? bio).split(',')[0],
      party: partyMap.get(bio) ?? '',
      state: stateMap.get(bio) ?? '',
      color: partyColor(partyMap.get(bio) ?? ''),
      blockedCount: bills.length,
      bills: [...new Set(bills)],
    })
  }

  gatekeepers.sort((a, b) => b.blockedCount - a.blockedCount)
  return gatekeepers.slice(0, 5)
}

// ---------------------------------------------------------------------------
// 10. Coming Up (floor schedule + committee meetings)
// ---------------------------------------------------------------------------

export interface UpcomingItemVM {
  id: string
  type: 'floor' | 'hearing'
  date: string
  title: string
  policyArea: string | null
  billTitle: string | null
}

const MAX_UPCOMING = 5

export function buildComingUpVM(
  activities: ActivityIndexResponse | null,
): UpcomingItemVM[] {
  if (!activities) return []

  const today = new Date().toISOString().slice(0, 10)

  const upcoming: UpcomingItemVM[] = []

  for (const a of activities.activities) {
    if (a.type !== 'floor_schedule' && a.type !== 'committee_meeting') continue
    if (a.date < today) continue

    upcoming.push({
      id: a.activity_id,
      type: a.type === 'floor_schedule' ? 'floor' : 'hearing',
      date: a.date,
      title: a.title ?? '',
      policyArea: a.bill?.policy_area ?? null,
      billTitle: a.bill?.title ?? null,
    })
  }

  upcoming.sort((a, b) => a.date.localeCompare(b.date))
  return upcoming.slice(0, MAX_UPCOMING)
}
