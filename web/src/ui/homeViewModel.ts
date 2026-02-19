import type {
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
