import fs from 'node:fs'
import path from 'node:path'

export function salvagePidsFromText(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return []
  const found = []
  const re = /"(worker|web|browser|tap)":\s*(\d+)/g
  let match
  while ((match = re.exec(raw)) !== null) {
    found.push(Number(match[2]))
  }
  return found
}

export function salvageEndpointsFromText(raw) {
  if (typeof raw !== 'string' || raw.length === 0) return {}
  const found = {}
  const re = /"(webPort|workerPort|cdpPort)":\s*(\d+)/g
  let match
  while ((match = re.exec(raw)) !== null) {
    found[match[1]] = Number(match[2])
  }
  return found
}

export function createStateStore(statePath) {
  function readStateOrCorrupt() {
    if (!fs.existsSync(statePath)) return { state: null, corrupt: false }
    const raw = fs.readFileSync(statePath, 'utf8')
    try {
      return { state: JSON.parse(raw), corrupt: false }
    } catch {
      return { state: null, corrupt: true }
    }
  }

  function readState() {
    const { state, corrupt } = readStateOrCorrupt()
    if (corrupt) {
      throw new Error('state.json is corrupt; run cleanup')
    }
    return state
  }

  function writeState(state) {
    const dir = path.dirname(statePath)
    fs.mkdirSync(dir, { recursive: true })
    const tmp = `${statePath}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`)
    fs.renameSync(tmp, statePath)
  }

  function updateState(patch) {
    const current = readState() || {}
    const next = { ...current, ...patch }
    if (current.pids || patch.pids) {
      next.pids = { ...current.pids, ...patch.pids }
    }
    writeState(next)
    return next
  }

  return { readState, writeState, updateState, readStateOrCorrupt }
}
