import type {
  ActivityIndexResponse,
  AmountEvidence,
  BillAnalysis,
  BillImpactEvidence,
  BillRef,
  FeaturedSenatorEntry,
  RecipientEvidence,
  SessionOverview,
  UnknownReason,
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
// 4. Recent Votes (named crossovers)
// ---------------------------------------------------------------------------

export interface Crossover {
  name: string
  party: string
  color: string
}

export interface RecentVoteVM {
  voteNumber: number
  date: string
  title: string
  result: string
  passed: boolean
  totalYea: number
  totalNay: number
  crossovers: Crossover[]
  isPartyLine: boolean
}

const MAX_RECENT = 5

export function buildRecentVotesVM(
  ledger: VoteLedger,
  overview: SessionOverview,
): RecentVoteVM[] {
  const partyMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  for (const s of overview.senators) {
    partyMap.set(s.bioguide_id, s.party)
    nameMap.set(s.bioguide_id, s.name)
  }

  const recent = ledger.entries.slice(0, MAX_RECENT)

  return recent.map((entry) => {
    const majority = partyMajorityForVote(entry, partyMap)

    let totalYea = 0
    let totalNay = 0
    const crossovers: Crossover[] = []

    for (const [bio, cast] of Object.entries(entry.member_votes)) {
      const cv = classifyVote(cast)
      if (cv === 'yea') totalYea++
      if (cv === 'nay') totalNay++

      const party = partyMap.get(bio)
      if (!party) continue
      const partyMaj = majority.get(party)
      if (partyMaj && (cv === 'yea' || cv === 'nay') && cv !== partyMaj) {
        const name = nameMap.get(bio) ?? bio
        crossovers.push({ name: name.split(',')[0], party, color: partyColor(party) })
      }
    }

    crossovers.sort((a, b) => {
      if (a.party !== b.party) return a.party.localeCompare(b.party)
      return a.name.localeCompare(b.name)
    })

    const resultLower = entry.result.toLowerCase()
    const passed = resultLower.includes('agreed') ||
      resultLower.includes('passed') ||
      resultLower.includes('confirmed')

    return {
      voteNumber: entry.vote_number,
      date: entry.vote_date,
      title: entry.title,
      result: entry.result,
      passed,
      totalYea,
      totalNay,
      crossovers,
      isPartyLine: crossovers.length === 0,
    }
  })
}

// ---------------------------------------------------------------------------
// 5. Enriched Votes (bill summaries, policy tags, margin analysis)
// ---------------------------------------------------------------------------

export interface EnrichedVoteVM {
  voteNumber: number
  date: string
  title: string
  billTitle: string | null
  billSummary: string | null
  policyArea: string | null
  result: string
  passed: boolean
  totalYea: number
  totalNay: number
  margin: number
  isClose: boolean
  crossovers: Crossover[]
  isPartyLine: boolean
}

const MAX_ENRICHED = 7
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
  return lc.includes('agreed') || lc.includes('passed') || lc.includes('confirmed')
}

export function buildEnrichedVotesVM(
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexResponse | null,
): EnrichedVoteVM[] {
  const partyMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  for (const s of overview.senators) {
    partyMap.set(s.bioguide_id, s.party)
    nameMap.set(s.bioguide_id, s.name)
  }

  const billLookup = activities ? buildBillLookup(activities) : new Map<number, BillRef>()
  const recent = ledger.entries.slice(0, MAX_ENRICHED)

  return recent.map((entry) => {
    const bill = billLookup.get(entry.vote_number)
    const { totalYea, totalNay } = computeVoteTallies(entry)
    const margin = Math.abs(totalYea - totalNay)
    const isClose = margin <= CLOSE_MARGIN_THRESHOLD

    const majority = partyMajorityForVote(entry, partyMap)
    const crossovers: Crossover[] = []

    if (isClose) {
      for (const [bio, cast] of Object.entries(entry.member_votes)) {
        const cv = classifyVote(cast)
        const party = partyMap.get(bio)
        if (!party) continue
        const partyMaj = majority.get(party)
        if (partyMaj && (cv === 'yea' || cv === 'nay') && cv !== partyMaj) {
          const name = nameMap.get(bio) ?? bio
          crossovers.push({ name: name.split(',')[0], party, color: partyColor(party) })
        }
      }
      crossovers.sort((a, b) => {
        if (a.party !== b.party) return a.party.localeCompare(b.party)
        return a.name.localeCompare(b.name)
      })
    }

    return {
      voteNumber: entry.vote_number,
      date: entry.vote_date,
      title: entry.title,
      billTitle: bill?.title ?? null,
      billSummary: cleanBillSummary(bill?.summary),
      policyArea: bill?.policy_area ?? entry.policy_area ?? null,
      result: entry.result,
      passed: isPassed(entry.result),
      totalYea,
      totalNay,
      margin,
      isClose,
      crossovers,
      isPartyLine: crossovers.length === 0,
    }
  })
}

// ---------------------------------------------------------------------------
// 6. Decisive Votes (close votes with swing senators)
// ---------------------------------------------------------------------------

export interface SwingSenator {
  name: string
  party: string
  state: string
  color: string
  voteCast: string
}

export interface DecisiveVoteVM {
  voteNumber: number
  date: string
  title: string
  billTitle: string | null
  billSummary: string | null
  policyArea: string | null
  result: string
  passed: boolean
  totalYea: number
  totalNay: number
  margin: number
  swingSenators: SwingSenator[]
}

export interface FeaturedSenatorVM {
  bioguideId: string
  name: string
  party: string
  state: string
  color: string
  score: number
  reasons: string[]
}

export interface DecisiveVotesResult {
  type: 'decisive' | 'featured'
  decisiveVotes: DecisiveVoteVM[]
  featuredSenators: FeaturedSenatorVM[]
  gatekeepers: GatekeeperVM[]
}

const MAX_DECISIVE = 5

export function buildDecisiveVotesVM(
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexResponse | null,
): DecisiveVotesResult {
  const partyMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  const stateMap = new Map<string, string>()
  for (const s of overview.senators) {
    partyMap.set(s.bioguide_id, s.party)
    nameMap.set(s.bioguide_id, s.name)
    stateMap.set(s.bioguide_id, s.state)
  }

  const billLookup = activities ? buildBillLookup(activities) : new Map<number, BillRef>()

  const decisiveVotes: DecisiveVoteVM[] = []

  for (const entry of ledger.entries) {
    const { totalYea, totalNay } = computeVoteTallies(entry)
    const margin = Math.abs(totalYea - totalNay)
    if (margin > CLOSE_MARGIN_THRESHOLD) continue

    const majority = partyMajorityForVote(entry, partyMap)
    const swingSenators: SwingSenator[] = []

    for (const [bio, cast] of Object.entries(entry.member_votes)) {
      const cv = classifyVote(cast)
      const party = partyMap.get(bio)
      if (!party) continue
      const partyMaj = majority.get(party)
      if (partyMaj && (cv === 'yea' || cv === 'nay') && cv !== partyMaj) {
        swingSenators.push({
          name: (nameMap.get(bio) ?? bio).split(',')[0],
          party,
          state: stateMap.get(bio) ?? '',
          color: partyColor(party),
          voteCast: cv === 'yea' ? 'Yea' : 'Nay',
        })
      }
    }

    if (swingSenators.length === 0) continue

    const bill = billLookup.get(entry.vote_number)
    decisiveVotes.push({
      voteNumber: entry.vote_number,
      date: entry.vote_date,
      title: entry.title,
      billTitle: bill?.title ?? null,
      billSummary: cleanBillSummary(bill?.summary),
      policyArea: bill?.policy_area ?? entry.policy_area ?? null,
      result: entry.result,
      passed: isPassed(entry.result),
      totalYea,
      totalNay,
      margin,
      swingSenators,
    })
  }

  decisiveVotes.splice(MAX_DECISIVE)

  const gatekeepers = buildGatekeepersVM(ledger, overview)

  if (decisiveVotes.length > 0) {
    return { type: 'decisive', decisiveVotes, featuredSenators: [], gatekeepers }
  }

  const featured = buildFeaturedSenatorsFallback(activities, overview)
  return { type: 'featured', decisiveVotes: [], featuredSenators: featured, gatekeepers }
}

function buildFeaturedSenatorsFallback(
  activities: ActivityIndexResponse | null,
  overview: SessionOverview,
): FeaturedSenatorVM[] {
  const entries = activities?.featured_senators
  if (!entries || entries.length === 0) return []

  const senatorMap = new Map<string, typeof overview.senators[number]>()
  for (const s of overview.senators) senatorMap.set(s.bioguide_id, s)

  return entries
    .sort((a: FeaturedSenatorEntry, b: FeaturedSenatorEntry) => b.score - a.score)
    .slice(0, 5)
    .map((f: FeaturedSenatorEntry) => {
      const s = senatorMap.get(f.bioguide_id)
      return {
        bioguideId: f.bioguide_id,
        name: s ? s.name.split(',')[0] : f.bioguide_id,
        party: s?.party ?? '',
        state: s?.state ?? '',
        color: s ? partyColor(s.party) : '#78716c',
        score: f.score,
        reasons: f.reasons,
      }
    })
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
}

export interface BillTimelineVM {
  groupKey: string
  issueType: 'bill' | 'nomination' | 'other'
  hasAnalysis: boolean
  displayCode: string | null
  officialTitle: string | null
  billTitle: string | null
  billSummary: string | null
  policyArea: string | null
  categoryLabel: string
  displayTitle: string
  meaningLine: string
  personalImpact: string
  moneyFlows: string[]
  structuredAmounts: AmountEvidence[]
  structuredRecipients: RecipientEvidence[]
  stateLocalImpact: string
  unknowns: string[]
  unknownReasons: UnknownReason[]
  evidence: string[]
  richnessScore: number
  statesMentioned: string[]
  confidence: 'high' | 'medium' | 'low'
  whyItMatters: string | null
  keyProvisions: string[]
  hiddenProvisions: string | null
  significance: 'high' | 'medium' | 'low'
  significanceReason: string
  affectedGroups: string[]
  steps: TimelineStep[]
  tier: 'key' | 'secondary'
  hasFailedProcedural: boolean
  hasCloseVote: boolean
  latestDate: string
  whatHappensNext: string
  finalStatus: 'passed' | 'rejected' | 'in-progress'
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

function normalizeConfidence(value: BillAnalysis['confidence'] | undefined): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'low'
}

function buildWhatHappensNext(
  issueType: BillTimelineVM['issueType'],
  finalStatus: BillTimelineVM['finalStatus'],
  lastStep: TimelineStep,
): string {
  if (finalStatus === 'passed') {
    if (issueType === 'nomination' || lastStep.type === 'confirmation') {
      return 'Nomination is approved by the Senate and can move to appointment.'
    }
    if (lastStep.type === 'passage') {
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

function buildFallbackHeadline(
  issueType: BillTimelineVM['issueType'],
  displayCode: string | null,
  categoryLabel: string,
  hasFailedProcedural: boolean,
  lastStep: TimelineStep,
): string {
  if (hasFailedProcedural && displayCode) return `${displayCode} was blocked`
  if (issueType === 'nomination' && displayCode) return `${displayCode} nomination vote`
  if (lastStep.type === 'passage' && displayCode) return `${displayCode} final vote`
  if (displayCode) return `${displayCode} Senate vote`
  if (issueType === 'nomination') return 'Nomination vote'
  return `${categoryLabel} Senate vote`
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
  issueType: BillTimelineVM['issueType'],
  finalStatus: BillTimelineVM['finalStatus'],
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

function buildPersonalImpact(
  issueType: BillTimelineVM['issueType'],
  policyArea: string | null,
  categoryLabel: string,
  meaningLine: string,
  analysisImpact: string | null,
  pocketbookImpact: string[],
): string {
  if (pocketbookImpact.length > 0) {
    return sanitizePrimaryNarrative(
      pocketbookImpact[0],
      'Official sources do not provide enough detail to estimate direct household-level impact.'
    )
  }
  if (analysisImpact) {
    return sanitizePrimaryNarrative(
      analysisImpact,
      'Official sources do not provide enough detail to estimate direct household-level impact.'
    )
  }
  if (issueType === 'nomination') {
    return 'Official sources describe the office being filled, but do not provide enough detail to estimate household-level impact.'
  }

  const lc = `${policyArea ?? ''} ${categoryLabel} ${meaningLine}`.toLowerCase()
  if (lc.includes('appropriation') || lc.includes('budget') || lc.includes('funding')) {
    return 'Official sources reference spending policy, but do not specify enough recipient and amount detail to estimate household impact.'
  }
  if (lc.includes('tax')) {
    return 'Official sources reference tax policy, but do not provide enough numeric detail to estimate household impact.'
  }
  if (lc.includes('health')) {
    return 'Official sources reference healthcare policy, but specific household cost impacts are not yet specified.'
  }
  if (lc.includes('transport') || lc.includes('transit') || lc.includes('infrastructure')) {
    return 'Official sources reference transportation policy, but direct household cost impact is not specified.'
  }
  if (lc.includes('immigra') || lc.includes('border')) {
    return 'Official sources reference border policy changes, but direct household-level effects are not specified.'
  }
  if (lc.includes('veteran') || lc.includes('defense') || lc.includes('armed')) {
    return 'Official sources reference military or veterans programs, but direct household-level effects are not specified.'
  }
  if (lc.includes('government') || lc.includes('politic') || lc.includes('dc council')) {
    return 'Official sources reference government rule changes, but direct household impact is not specified.'
  }
  return 'The official summary does not yet provide enough detail to estimate direct household impact.'
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

const MAX_BILL_GROUPS = 7

export function buildBillTimelineVM(
  ledger: VoteLedger,
  overview: SessionOverview,
  activities: ActivityIndexResponse | null,
): BillTimelineVM[] {
  const partyMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  for (const s of overview.senators) {
    partyMap.set(s.bioguide_id, s.party)
    nameMap.set(s.bioguide_id, s.name)
  }

  const billLookup = activities ? buildBillLookup(activities) : new Map<number, BillRef>()

  const groups = new Map<string, VoteLedgerEntry[]>()
  for (const entry of ledger.entries) {
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
    const hasAnalysis = Boolean(analysis)
    const officialTitle = deriveDisplayTitle(entries, billTitle)
    const categoryLabel = analysis?.category?.trim()
      || policyArea
      || (issueType === 'nomination' ? 'Nomination' : 'Senate business')
    const significance = normalizeSignificance(analysis?.significance)
    const richnessScore = analysis?.richness_score ?? impactEvidence?.richness_score ?? 0
    const normalizedConfidence = normalizeConfidence(analysis?.confidence)
    const confidence = normalizedConfidence === 'low' && richnessScore >= 60 ? 'medium' : normalizedConfidence
    const rawSignificanceReason = analysis?.significance_reason?.trim() || ''
    const significanceReason = rawSignificanceReason.toLowerCase() === 'based on available official summary details.'
      ? ''
      : rawSignificanceReason
    const keyProvisions = (analysis?.key_provisions ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 4)
    const affectedGroups = (analysis?.affects ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 5)
    const hiddenProvisions = analysis?.hidden_provisions?.trim() || null
    const whyItMatters = analysis?.why_it_matters?.trim() || null
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
    const stateLocalImpact = sanitizePrimaryNarrative(
      analysis?.state_local_impact?.trim()
      || (
        impactEvidence?.where.states_mentioned?.length
          ? `State-level signals are explicitly named for: ${impactEvidence.where.states_mentioned.join(', ')}.`
          : 'State-level allocation detail is not specified in available official sources.'
      ),
      'State-level allocation detail is not specified in available official sources.'
    )
    const unknowns = (analysis?.unknowns ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 6)
    const unknownReasons = (analysis?.unknown_reasons ?? impactEvidence?.unknowns ?? []).slice(0, 6)
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
    const pocketbookImpact = (analysis?.pocketbook_impact ?? [])
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 6)
    const displayCode = decodeIssueLabel(entries[0].issue)

    const steps: TimelineStep[] = entries.map((entry) => {
      const stepType = classifyQuestion(entry.question || entry.title)
      const { totalYea, totalNay } = computeVoteTallies(entry)
      const margin = Math.abs(totalYea - totalNay)
      const isClose = margin <= CLOSE_MARGIN_THRESHOLD
      const passed = isPassed(entry.result)
      const labels = STEP_LABELS[stepType]
      const label = passed ? labels[0] : labels[1]

      const crossovers: Crossover[] = []
      if (isClose) {
        const majority = partyMajorityForVote(entry, partyMap)
        for (const [bio, cast] of Object.entries(entry.member_votes)) {
          const cv = classifyVote(cast)
          const party = partyMap.get(bio)
          if (!party) continue
          const partyMaj = majority.get(party)
          if (partyMaj && (cv === 'yea' || cv === 'nay') && cv !== partyMaj) {
            const name = nameMap.get(bio) ?? bio
            crossovers.push({ name: name.split(',')[0], party, color: partyColor(party) })
          }
        }
        crossovers.sort((a, b) => {
          if (a.party !== b.party) return a.party.localeCompare(b.party)
          return a.name.localeCompare(b.name)
        })
      }

      return { type: stepType, label, passed, date: entry.vote_date, totalYea, totalNay, margin, isClose, crossovers }
    })

    const lastStep = steps[steps.length - 1]
    const anyFailed = steps.some((s) => !s.passed)
    const hasFailedProcedural = steps.some((s) => (s.type === 'proceed' || s.type === 'cloture') && !s.passed)
    const hasCloseVote = steps.some((s) => s.isClose)
    const finalStatus: BillTimelineVM['finalStatus'] = anyFailed
      ? 'rejected'
      : (lastStep.type === 'passage' || lastStep.type === 'confirmation') ? 'passed' : 'in-progress'
    const tier: BillTimelineVM['tier'] = (
      significance === 'high'
      || hasCloseVote
      || hasFailedProcedural
      || lastStep.type === 'passage'
      || lastStep.type === 'confirmation'
    ) ? 'key' : 'secondary'
    const whatHappensNext = buildWhatHappensNext(issueType, finalStatus, lastStep)
    const displayTitle = analysis?.plain_title?.trim()
      || buildFallbackHeadline(issueType, displayCode, categoryLabel, hasFailedProcedural, lastStep)
    const meaningLine = buildMeaningLine(
      issueType,
      finalStatus,
      lastStep,
      analysis?.plain_summary?.trim() || null,
      moneyFlows,
      billSummary,
    )
    const personalImpactRaw = buildPersonalImpact(
      issueType,
      policyArea,
      categoryLabel,
      meaningLine,
      whyItMatters,
      pocketbookImpact,
    )
    const personalImpact = confidence === 'low'
      ? `Limited detail: ${sanitizePrimaryNarrative(personalImpactRaw, 'Official sources do not provide enough detail to estimate direct household impact.')}`
      : sanitizePrimaryNarrative(personalImpactRaw, 'Official sources do not provide enough detail to estimate direct household impact.')

    timelines.push({
      groupKey,
      issueType,
      hasAnalysis,
      displayCode,
      officialTitle,
      billTitle,
      billSummary,
      policyArea,
      categoryLabel,
      displayTitle,
      meaningLine,
      personalImpact,
      moneyFlows,
      structuredAmounts,
      structuredRecipients,
      stateLocalImpact,
      unknowns: normalizedUnknowns,
      unknownReasons,
      evidence: normalizedEvidence,
      richnessScore,
      statesMentioned: analysis?.states_mentioned ?? impactEvidence?.where.states_mentioned ?? [],
      confidence,
      whyItMatters,
      keyProvisions,
      hiddenProvisions,
      significance,
      significanceReason,
      affectedGroups,
      steps,
      tier,
      hasFailedProcedural,
      hasCloseVote,
      latestDate: entries[entries.length - 1].vote_date,
      whatHappensNext,
      finalStatus,
    })
  }

  timelines.sort((a, b) => b.latestDate.localeCompare(a.latestDate))
  return timelines.slice(0, MAX_BILL_GROUPS)
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
