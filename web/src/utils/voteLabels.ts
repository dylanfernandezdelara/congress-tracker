import type { VoteDetailResponse } from '../api'

export function formatVoteDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatBriefingVoteDate(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function prettyParty(value: string): string {
  if (value === 'D') return 'Democrats'
  if (value === 'R') return 'Republicans'
  if (value === 'I') return 'Independents'
  return value
}

export function statusLabel(value: 'passed' | 'rejected' | 'in-progress'): string {
  if (value === 'passed') return 'Passed'
  if (value === 'rejected') return 'Rejected'
  return 'In progress'
}

export function coverageLabel(value: VoteDetailResponse['source_coverage']['level']): string {
  if (value === 'full') return 'Full context'
  if (value === 'partial') return 'Partial context'
  return 'Minimal context'
}

export function confidenceVariant(value: 'high' | 'medium' | 'low'): 'success' | 'secondary' | 'destructive' {
  if (value === 'high') return 'success'
  if (value === 'medium') return 'secondary'
  return 'destructive'
}
