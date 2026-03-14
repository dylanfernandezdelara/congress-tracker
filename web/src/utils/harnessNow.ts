const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

export function readHarnessNow(search: string, hostname: string): Date | null {
  if (!LOCAL_HOSTS.has(hostname)) return null
  const raw = new URLSearchParams(search).get('harness_now')
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
