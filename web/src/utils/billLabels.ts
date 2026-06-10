const TYPE_LABELS: Record<string, string> = {
  HR: 'H.R.',
  S: 'S.',
  HRES: 'H.Res.',
  SRES: 'S.Res.',
  HJRES: 'H.J.Res.',
  SJRES: 'S.J.Res.',
}

export function formatBillDocket(type: string, number: number, congress: number): string {
  const label = TYPE_LABELS[type.toUpperCase()] ?? type
  return `${label} ${number} · ${congress}th Congress`
}

export function congressGovBillUrl(congress: number, type: string, number: number): string {
  const seg = type.toLowerCase()
  return `https://www.congress.gov/bill/${congress}th-congress/${seg === 'hr' ? 'house-bill' : seg === 's' ? 'senate-bill' : seg}/${number}`
}

export function formatVoteDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function voteResultClass(result: string): string {
  const r = result.toLowerCase()
  if (r.includes('pass') || r.includes('agreed')) return 'text-pass'
  if (r.includes('fail') || r.includes('reject')) return 'text-fail'
  return 'text-faint'
}
