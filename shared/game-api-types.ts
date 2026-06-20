export interface BillDigestContent {
  headline: string
  what_it_does: string
  key_points: string[]
  terms_explained: Array<{ term: string; plain: string }>
}

export interface GameBillRef {
  congress: number
  type: string
  number: number
  title: string | null
}

export interface GamePassageVote {
  chamber: 'House' | 'Senate'
  question: string
  result: string
  yeas: number
  nays: number
  date: string
}

export interface GameRoundPrompt {
  headline: string
  snippet: string
}

export interface GameRound {
  id: string
  prompt: GameRoundPrompt
}

export interface GameRoundsResponse {
  rounds: GameRound[]
  total: number
  limit: number
}

export interface GamePartySplit {
  party: string
  yeas: number
  nays: number
}

export interface GameRevealResponse {
  id: string
  correct: 'passed' | 'failed'
  vote: GamePassageVote
  bill: GameBillRef
  policy_area: string | null
  digest: BillDigestContent | null
  party_split: GamePartySplit[] | null
}
