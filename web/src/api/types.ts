export interface BillDigestContent {
  headline: string
  what_it_does: string
  key_points: string[]
  terms_explained: Array<{ term: string; plain: string }>
}

export interface FeedBill {
  congress: number
  type: string
  number: number
  title: string | null
}

export interface FeedPassageVote {
  chamber: 'House' | 'Senate'
  question: string
  result: string
  yeas: number
  nays: number
  date: string
}

export interface FeedItem {
  bill: FeedBill
  policy_area: string | null
  digest: BillDigestContent | null
  raw_summary_text: string | null
  passage_votes: FeedPassageVote[]
  latest_passage_date: string
}
