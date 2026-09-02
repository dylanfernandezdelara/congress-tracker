#!/usr/bin/env node
/**
 * Detached CDP sidecar: enable Console + Network + Runtime and append JSONL.
 * Must not call browser.close() — that kills the verification Chromium.
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseArgs, UsageError } from './args.mjs'

function appendJsonl(filePath, row) {
  fs.appendFileSync(filePath, `${JSON.stringify(row)}\n`)
}

function formatRemoteArgs(args = []) {
  return args
    .map((arg) => {
      if (arg.value !== undefined) return String(arg.value)
      if (arg.unserializableValue) return String(arg.unserializableValue)
      if (arg.description) return String(arg.description)
      return arg.type || ''
    })
    .join(' ')
}

async function attachPage(page, consolePath, networkPath, sessions) {
  const session = await page.context().newCDPSession(page)
  sessions.add(session)
  await session.send('Runtime.enable')
  await session.send('Console.enable')
  await session.send('Network.enable')

  session.on('Runtime.consoleAPICalled', (event) => {
    appendJsonl(consolePath, {
      type: event.type || 'log',
      text: formatRemoteArgs(event.args),
      t: new Date().toISOString(),
    })
  })
  session.on('Runtime.exceptionThrown', (event) => {
    const details = event.exceptionDetails || {}
    appendJsonl(consolePath, {
      type: 'error',
      text: details.text || details.exception?.description || 'exception',
      t: new Date().toISOString(),
    })
  })
  const requests = new Map()
  session.on('Network.requestWillBeSent', (event) => {
    const method = event.request?.method
    const url = event.request?.url
    if (event.requestId) requests.set(event.requestId, { method, url })
    appendJsonl(networkPath, {
      method,
      url,
      t: new Date().toISOString(),
    })
  })
  session.on('Network.responseReceived', (event) => {
    const prior = event.requestId ? requests.get(event.requestId) : undefined
    appendJsonl(networkPath, {
      method: prior?.method,
      url: event.response?.url || prior?.url,
      status: event.response?.status,
      t: new Date().toISOString(),
    })
  })
}

async function connect(cdpUrl) {
  const { chromium } = await import('playwright')
  const deadline = Date.now() + 20_000
  let last = 'no connection'
  while (Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(cdpUrl)
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`could not connect to ${cdpUrl} (${last})`)
}

async function main(argv) {
  const flags = parseArgs(argv)
  const cdpUrl = flags['cdp-url']
  const outDir = flags['out-dir']
  if (!cdpUrl || !outDir) {
    throw new UsageError('Usage: node devtools-tap.mjs --cdp-url <url> --out-dir <dir>')
  }

  fs.mkdirSync(outDir, { recursive: true })
  const consolePath = path.join(outDir, 'console.jsonl')
  const networkPath = path.join(outDir, 'network.jsonl')

  const browser = await connect(cdpUrl)
  if (!fs.existsSync(consolePath)) fs.writeFileSync(consolePath, '')
  if (!fs.existsSync(networkPath)) fs.writeFileSync(networkPath, '')
  const sessions = new Set()
  const attachedPages = new WeakSet()
  const watchedContexts = new WeakSet()

  const attachIfNeeded = (page) => {
    if (attachedPages.has(page)) return
    attachedPages.add(page)
    attachPage(page, consolePath, networkPath, sessions).catch((err) => {
      attachedPages.delete(page)
      console.error(`devtools-tap: attach failed: ${err instanceof Error ? err.message : err}`)
    })
  }

  const watchContext = (context) => {
    if (watchedContexts.has(context)) return
    watchedContexts.add(context)
    context.on('page', attachIfNeeded)
    for (const page of context.pages()) attachIfNeeded(page)
  }

  for (const context of browser.contexts()) watchContext(context)
  const sweep = setInterval(() => {
    for (const context of browser.contexts()) watchContext(context)
  }, 1000)
  sweep.unref()

  const shutdown = async () => {
    clearInterval(sweep)
    for (const session of sessions) {
      try {
        await session.send('Runtime.disable')
      } catch {
        // chrome already gone
      }
      try {
        await session.send('Console.disable')
      } catch {
        // chrome already gone
      }
      try {
        await session.send('Network.disable')
      } catch {
        // chrome already gone
      }
    }
    // Do not browser.close() — that sends CDP Browser.close and kills Chromium.
    process.exit(0)
  }

  process.on('SIGTERM', () => {
    shutdown().catch(() => process.exit(0))
  })
  process.on('SIGINT', () => {
    shutdown().catch(() => process.exit(0))
  })
}

main(process.argv.slice(2)).catch((err) => {
  if (err instanceof UsageError) {
    console.error(err.message)
    process.exit(2)
  }
  console.error(`devtools-tap: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
