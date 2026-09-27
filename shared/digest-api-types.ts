export interface BillDigestInsideRow {
  /** Plain name for a part of a long bill ("Taxes", "Medicaid"). */
  part: string
  summary: string
  /** Where it is in the bill ("Title VII"), or null. */
  section: string | null
  /** Share of the bill's text this part takes up (0–100), measured from the text, never from the model. */
  share: number | null
}

export interface BillDigestContent {
  headline: string
  what_it_does: string
  key_points: string[]
  terms_explained: Array<{ term: string; plain: string }>
  /** v3 summaries: the section each key point comes from ("Sec. 2"), parallel to `key_points`. */
  key_point_sections?: Array<string | null>
  /** v3 summaries: plain-language groups of people the bill affects. */
  who_it_affects?: string[]
  /** v3 summaries of long bills: what each major part does. */
  inside?: BillDigestInsideRow[]
  /**
   * What the summary was written from: the bill text, only the CRS summary, or only the title (a provisional
   * summary until text is published). Absent on summaries written before v3.
   */
  basis?: 'text' | 'crs' | 'title_only'
}
