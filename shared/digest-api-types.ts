export interface BillDigestContent {
  headline: string
  what_it_does: string
  key_points: string[]
  terms_explained: Array<{ term: string; plain: string }>
}
