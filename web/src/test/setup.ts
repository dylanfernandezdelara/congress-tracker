import '@testing-library/jest-dom'

// Storage parity across Node versions.
//
// CI runs Node 20, but local dev often runs newer Node (22+), which ships an
// experimental global `localStorage`/`sessionStorage` that is unusable without
// `--localstorage-file` and shadows other storage. jsdom 28 under Vitest also
// does not expose a working `window.localStorage` here. The bare `localStorage`
// global the app and tests rely on therefore breaks locally while passing on
// CI. Install a minimal in-memory Storage only when the environment's storage
// is missing or unusable, so behavior is identical everywhere.
class MemoryStorage implements Storage {
  #store = new Map<string, string>()

  get length(): number {
    return this.#store.size
  }

  clear(): void {
    this.#store.clear()
  }

  getItem(key: string): string | null {
    return this.#store.has(key) ? (this.#store.get(key) as string) : null
  }

  key(index: number): string | null {
    return [...this.#store.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.#store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.#store.set(key, String(value))
  }
}

function isUsable(storage: unknown): storage is Storage {
  try {
    if (!storage) return false
    const probe = '__storage_probe__'
    ;(storage as Storage).setItem(probe, '1')
    const ok = (storage as Storage).getItem(probe) === '1'
    ;(storage as Storage).removeItem(probe)
    return ok
  } catch {
    return false
  }
}

const jsdomWindow = (globalThis as { window?: Window & typeof globalThis }).window
for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (isUsable((globalThis as Record<string, unknown>)[key])) continue
  const storage = new MemoryStorage()
  const descriptor: PropertyDescriptor = { configurable: true, writable: true, value: storage }
  Object.defineProperty(globalThis, key, descriptor)
  if (jsdomWindow) {
    Object.defineProperty(jsdomWindow, key, descriptor)
  }
}
