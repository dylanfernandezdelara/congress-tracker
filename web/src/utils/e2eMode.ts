export function isE2eMode(search: string): boolean {
  return import.meta.env.VITE_FORCE_E2E === '1' || new URLSearchParams(search).get('e2e') === '1'
}
