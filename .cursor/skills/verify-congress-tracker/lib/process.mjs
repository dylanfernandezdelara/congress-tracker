import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

import { VERIFY_VITE_MODE } from './endpoints.mjs'

export function sleepMs(ms) {
  const view = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(view, 0, 0, ms)
}

export function pidAlive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// Signal the whole process group first: a dead npm leader leaves Vite/wrangler/Chromium
// children alive in the same group, so the leader's liveness must not gate the group kill.
export function killPid(pid, signal = 'SIGTERM') {
  if (!pid || pid <= 1) return
  try {
    process.kill(-pid, signal)
    return
  } catch {
    // no such group (or not a group leader); fall back to the pid itself
  }
  if (!pidAlive(pid)) return
  try {
    process.kill(pid, signal)
  } catch {
    // already gone
  }
}

function groupAlive(pid) {
  return pidAlive(-pid) || pidAlive(pid)
}

export function listenersOnPort(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
  })
  if (result.error?.code === 'ENOENT') {
    throw new Error('lsof is required')
  }
  if (result.status !== 0) return []
  return [...new Set(result.stdout.trim().split(/\n/).filter(Boolean).map(Number))]
}

export function portFree(port) {
  return listenersOnPort(port).length === 0
}

function ancestorPids(pid, maxDepth = 8) {
  const chain = []
  let current = pid
  for (let i = 0; i < maxDepth; i += 1) {
    if (!current || current <= 1) break
    const result = spawnSync('ps', ['-o', 'ppid=', '-p', String(current)], { encoding: 'utf8' })
    const ppid = Number((result.stdout || '').trim())
    if (!Number.isInteger(ppid) || ppid <= 1) break
    chain.push(ppid)
    current = ppid
  }
  return chain
}

export function listenerOwnedBy(listenerPid, recordedPid) {
  if (!listenerPid || !recordedPid) return false
  if (listenerPid === recordedPid) return true
  return ancestorPids(listenerPid).includes(recordedPid)
}

function commandLine(pid) {
  if (process.platform === 'linux') {
    try {
      return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
    } catch {
      // fall through to ps
    }
  }
  const result = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' })
  return (result.stdout || '').trim()
}

// Corrupt-state cleanup has no recorded pids. Only claim a listener when it, or an
// ancestor, visibly belongs to a verification run: wrangler/Chromium/tap all carry
// the run dir in argv; Vite does not, so the web port requires `--mode <VERIFY_VITE_MODE>`.
export function listenerLooksLikeVerification(
  listenerPid,
  runDir,
  { isWebPort = false, commandLine: cmdFn = commandLine, ancestorPids: ancestorsFn = ancestorPids } = {},
) {
  const lines = [listenerPid, ...ancestorsFn(listenerPid)].map((pid) => cmdFn(pid))
  if (lines.some((line) => line.includes(runDir))) return true
  return isWebPort && lines.some((line) => line.includes(`--mode ${VERIFY_VITE_MODE}`))
}

export function portOwnershipProblem(
  port,
  recordedPid,
  { requireListener = true, listenersOnPort: listFn = listenersOnPort, listenerOwnedBy: ownedFn = listenerOwnedBy } = {},
) {
  const listeners = listFn(port)
  if (listeners.length === 0) {
    return requireListener ? `nothing listening on ${port}` : null
  }
  if (listeners.some((pid) => ownedFn(pid, recordedPid))) return null
  return `port ${port} is held by pid ${listeners[0]}, not this run`
}

export function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) {
          reject(new Error(`timed out waiting for 127.0.0.1:${port}`))
          return
        }
        setTimeout(tryOnce, 250)
      })
    }
    tryOnce()
  })
}

export function spawnLogged(command, args, logPath, { cwd, extraEnv = {} } = {}) {
  if (!cwd) throw new Error('spawnLogged requires cwd')
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  const logFd = fs.openSync(logPath, 'a')
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, FORCE_COLOR: '0', CI: process.env.CI || '1', ...extraEnv },
  })
  child.unref()
  fs.closeSync(logFd)
  return child.pid
}

export function teardownPids(pids, { graceMs = 8000 } = {}) {
  const list = [...new Set((pids || []).filter((pid) => Number(pid) > 1))]
  for (const pid of list) killPid(pid, 'SIGTERM')
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline && list.some((pid) => groupAlive(pid))) {
    sleepMs(200)
  }
  const leftover = list.filter((pid) => groupAlive(pid))
  if (leftover.length > 0) {
    for (const pid of leftover) killPid(pid, 'SIGKILL')
    sleepMs(400)
  }
  return list.filter((pid) => groupAlive(pid))
}

export function recordedPids(state) {
  return [state?.pids?.tap, state?.pids?.browser, state?.pids?.web, state?.pids?.worker]
}
