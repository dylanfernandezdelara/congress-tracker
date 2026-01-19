/**
 * TypeScript types for the Senate Data Worker API responses.
 *
 * These types mirror the output JSON schemas from the worker (per SPEC.md v2).
 */

export type ActivitySource = 'congress' | 'senate' | 'govinfo'
export type ActivityType =
  | 'legislation_action'
  | 'floor_schedule'
  | 'committee_meeting'
  | 'daily_digest'

export interface MemberIndexEntry {
  bioguide_id: string
  name: string
  party: string
  state: string
  chamber: 'Senate'
  url?: string
}

export interface MemberIndexResponse {
  congress: number
  generated_at: string
  members: MemberIndexEntry[]
}

export interface ActivityWindow {
  start_date: string
  end_date: string
}

export interface BillRef {
  congress: number
  type: string
  number: string
  title?: string
  url?: string
}

export interface LegislationActionItem {
  source: 'congress'
  type: 'legislation_action'
  role: 'sponsor' | 'cosponsor'
  action_date: string
  action_text: string
  bill: BillRef
}

export interface FloorScheduleItem {
  source: 'senate'
  type: 'floor_schedule'
  date: string
  time?: string
  title: string
  summary?: string
  location?: string
  url?: string
}

export interface CommitteeMeetingItem {
  source: 'senate'
  type: 'committee_meeting'
  date: string
  time?: string
  committee: string
  subcommittee?: string
  title: string
  location?: string
  url?: string
}

export interface DailyDigestItem {
  source: 'govinfo'
  type: 'daily_digest'
  date: string
  title: string
  url?: string
  senate_section_url?: string
  summary?: string
}

export type ActivityItem =
  | LegislationActionItem
  | FloorScheduleItem
  | CommitteeMeetingItem
  | DailyDigestItem

export interface MemberActivityContext {
  floor_schedule: FloorScheduleItem[]
  committee_meetings: CommitteeMeetingItem[]
  daily_digest: DailyDigestItem[]
}

export interface SourceError {
  source: ActivitySource
  message: string
}

export interface MemberActivityResponse {
  member: MemberIndexEntry
  congress: number
  generated_at: string
  window: ActivityWindow
  activities: ActivityItem[]
  context: MemberActivityContext
  partial: boolean
  errors: SourceError[]
}
