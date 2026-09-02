export class UsageError extends Error {
  constructor(message = 'usage') {
    super(message)
    this.name = 'UsageError'
  }
}

export function parseArgs(argv) {
  const flags = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--exact' || token === '--full-page' || token === '--aria') {
      flags[token.slice(2)] = true
      continue
    }
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`missing value for --${key}`)
      }
      flags[key] = value
      i += 1
      continue
    }
    flags._.push(token)
  }
  return flags
}
