/**
 * Playwright-over-CDP browser subcommands and CDP allowlist for the helper.
 */
import fs from 'node:fs'
import path from 'node:path'

import { isAllowedAppUrl } from './endpoints.mjs'
import { parseViewportFlags } from './viewport.mjs'

const CDP_PREFIXES = [
  'Runtime.',
  'DOM.',
  'CSS.',
  'Console.',
  'Network.',
  'Accessibility.',
  'Profiler.',
  'HeapProfiler.',
  'Performance.',
  'Overlay.',
  'Emulation.',
]
const CDP_EXACT = ['Page.captureScreenshot', 'Page.getLayoutMetrics', 'Page.getNavigationHistory']

const CDP_DENIED = ['Runtime.compileScript', 'Runtime.runScript']

export const ACCESSIBLE_NAME_MAX = 120

export const INTERACTIVE_ROLES = [
  'button',
  'link',
  'textbox',
  'combobox',
  'radio',
  'checkbox',
  'tab',
  'searchbox',
  'option',
]

const INTERACTIVE_CANDIDATE_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'a[href]',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="combobox"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="tab"]',
  '[role="option"]',
].join(',')

export function isAllowedCdpMethod(method) {
  if (typeof method !== 'string' || method.length === 0) return false
  if (CDP_DENIED.includes(method)) return false
  if (CDP_EXACT.includes(method)) return true
  return CDP_PREFIXES.some((prefix) => method.startsWith(prefix))
}

export function parseName(raw) {
  if (raw === undefined) return undefined
  const match = raw.match(/^\/(.+)\/([a-z]*)$/s)
  if (match) return new RegExp(match[1], match[2])
  return raw
}

export function jsLooksLikeNavigation(js) {
  return /location\s*=(?!=)|location\.href\s*=|location\[['"]href['"]\]|window\[['"]location['"]\]|document\[['"]location['"]\]|location\.assign\s*\(|location\.replace\s*\(|document\.location|window\.open\s*\(|history\.(pushState|replaceState|go|back|forward)\s*\(/i.test(
    js,
  )
}

export function clipAccessibleName(raw, max = ACCESSIBLE_NAME_MAX) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, max)
}

export function normalizeRef(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error('ref is required')
  }
  const match = String(raw).trim().match(/^@?(e\d+)$/)
  if (!match) throw new Error(`invalid ref: ${raw} (expected e1 or @e1)`)
  return match[1]
}

export function formatInteractiveLine(entry) {
  const states = []
  if (entry.expanded === 'true') states.push('expanded')
  if (entry.expanded === 'false') states.push('collapsed')
  if (entry.checked === 'true') states.push('checked')
  if (entry.checked === 'false') states.push('unchecked')
  if (entry.disabled) states.push('disabled')
  const state = states.length > 0 ? ` (${states.join(', ')})` : ''
  const name = String(entry.name ?? '').replace(/"/g, '\\"')
  return `[${entry.ref}] ${entry.role} "${name}"${state}`
}

export function describeLocator(flags, { all = false } = {}) {
  if (flags.ref) {
    return { kind: 'ref', ref: normalizeRef(flags.ref) }
  }
  if (!flags.selector && !flags.role && !flags.name) {
    throw new Error('browser action needs --role --name, --name <label>, --selector, or --ref')
  }
  let nth
  if (!all && flags.nth !== undefined) {
    const n = Number(flags.nth)
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`--nth must be a non-negative integer (got ${flags.nth})`)
    }
    nth = n
  }
  if (flags.selector) return { kind: 'selector', selector: flags.selector, nth }
  if (flags.role) {
    return { kind: 'role', role: flags.role, name: flags.name, exact: Boolean(flags.exact), nth }
  }
  return { kind: 'label', name: flags.name, nth }
}

function staleRefError(ref) {
  return new Error(
    `ref ${ref} is stale or missing; run browser snapshot --interactive again (refs are invalidated by re-render)`,
  )
}

export async function getLocator(page, flags, { all = false } = {}) {
  const described = describeLocator(flags, { all })
  let locator
  if (described.kind === 'ref') {
    locator = page.locator(`[data-verify-ref="${described.ref}"]`)
    if ((await locator.count()) === 0) {
      throw staleRefError(described.ref)
    }
    return locator
  }
  if (described.kind === 'selector') {
    locator = page.locator(described.selector)
  } else if (described.kind === 'role') {
    const options = {}
    if (described.name !== undefined) options.name = parseName(described.name)
    if (described.exact) options.exact = true
    locator = page.getByRole(described.role, options)
  } else {
    locator = page.getByLabel(parseName(described.name))
  }
  if (described.nth !== undefined) locator = locator.nth(described.nth)
  return locator
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function printJsonlOrEmpty(filePath) {
  if (!fs.existsSync(filePath)) {
    process.stdout.write('(empty)\n')
    return
  }
  const text = fs.readFileSync(filePath, 'utf8')
  if (!text.trim()) {
    process.stdout.write('(empty)\n')
    return
  }
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
}

async function summarizeMatch(locator) {
  return locator.evaluate(
    (node, maxName) => {
      const tag = node.tagName.toLowerCase()
      const name = (node.getAttribute('aria-label') || node.innerText || node.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, maxName)
      const expanded = node.getAttribute('aria-expanded')
      return { tag, name, expanded }
    },
    ACCESSIBLE_NAME_MAX,
  )
}

export async function collectInteractiveElements(page) {
  const entries = await page.evaluate(
    ({ roles, maxName, selector }) => {
      const roleSet = new Set(roles)

      function implicitRole(el) {
        const explicit = el.getAttribute('role')
        if (explicit) return explicit
        const tag = el.tagName.toLowerCase()
        const type = (el.getAttribute('type') || '').toLowerCase()
        if (tag === 'button') return 'button'
        if (tag === 'a' && el.hasAttribute('href')) return 'link'
        if (tag === 'textarea') return 'textbox'
        if (tag === 'select') return 'combobox'
        if (tag === 'option') return 'option'
        if (tag === 'input') {
          if (type === 'search') return 'searchbox'
          if (type === 'checkbox') return 'checkbox'
          if (type === 'radio') return 'radio'
          if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') {
            return 'button'
          }
          if (type === 'hidden' || type === 'file' || type === 'range' || type === 'color') return null
          return 'textbox'
        }
        return null
      }

      document.querySelectorAll('[data-verify-ref]').forEach((node) => node.removeAttribute('data-verify-ref'))

      const seen = new Set()
      const collected = []
      for (const node of document.querySelectorAll(selector)) {
        if (seen.has(node)) continue
        const role = implicitRole(node)
        if (!role || !roleSet.has(role)) continue
        seen.add(node)
        collected.push({ node, role })
      }

      return collected.map(({ node, role }, index) => {
        const ref = `e${index + 1}`
        node.setAttribute('data-verify-ref', ref)
        const expanded = node.getAttribute('aria-expanded')
        const ariaChecked = node.getAttribute('aria-checked')
        const isCheckable =
          node instanceof HTMLInputElement && (node.type === 'checkbox' || node.type === 'radio')
        const checked = isCheckable ? (node.checked ? 'true' : 'false') : ariaChecked
        const disabled =
          (node instanceof HTMLElement && 'disabled' in node && Boolean(node.disabled)) ||
          node.getAttribute('aria-disabled') === 'true'
        const name = (node.getAttribute('aria-label') || node.innerText || node.textContent || '')
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, maxName)
        return { ref, role, name, expanded, checked, disabled }
      })
    },
    {
      roles: INTERACTIVE_ROLES,
      maxName: ACCESSIBLE_NAME_MAX,
      selector: INTERACTIVE_CANDIDATE_SELECTOR,
    },
  )
  return entries
}

async function assertStayedOnApp(page, webUrl) {
  if (isAllowedAppUrl(page.url(), webUrl)) return
  await page.goto(webUrl, { waitUntil: 'domcontentloaded' })
  throw new Error('page was on a disallowed URL; restored to home')
}

function parseCdpParams(raw) {
  if (raw === undefined) return {}
  let params
  try {
    params = JSON.parse(raw)
  } catch {
    throw new Error('cdp --params must be a JSON object')
  }
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new Error('cdp --params must be a JSON object')
  }
  return params
}

export async function runBrowserCommand(command, flags, ctx) {
  const { withPage, resolveEvidencePath, WEB_URL, CDP_PORT, consoleLogPath, networkLogPath } = ctx

  if (command === 'start') {
    await withPage(async (page) => {
      if (!isAllowedAppUrl(page.url(), WEB_URL)) {
        await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' })
      }
      console.log(`browser ready cdp=http://127.0.0.1:${CDP_PORT} page=${page.url()}`)
    })
    return
  }

  if (command === 'goto') {
    const target = flags.url || `${WEB_URL}${flags.path || '/'}`
    if (!isAllowedAppUrl(target, WEB_URL)) {
      throw new Error(`goto target is not allowed: ${target}`)
    }
    await withPage(async (page) => {
      await page.goto(target, { waitUntil: 'domcontentloaded' })
      console.log(`goto ${page.url()}`)
    })
    return
  }

  if (command === 'url') {
    await withPage(async (page) => {
      console.log(`url ${page.url()}`)
      console.log(`title ${await page.title()}`)
    })
    return
  }

  if (command === 'find') {
    await withPage(async (page) => {
      const locator = await getLocator(page, flags, { all: true })
      const count = await locator.count()
      const cap = Math.min(count, 20)
      console.log(`${count} match(es)`)
      for (let i = 0; i < cap; i += 1) {
        const summary = await summarizeMatch(locator.nth(i))
        const expanded =
          summary.expanded === null || summary.expanded === undefined
            ? ''
            : ` aria-expanded=${summary.expanded}`
        console.log(`${i} <${summary.tag}> ${summary.name}${expanded}`)
      }
    })
    return
  }

  if (command === 'scroll') {
    await withPage(async (page) => {
      const locator = await getLocator(page, flags)
      await locator.scrollIntoViewIfNeeded()
      const target = flags.ref
        ? `--ref ${normalizeRef(flags.ref)}`
        : `${flags.role || flags.selector} ${flags.name || ''}`.trim()
      console.log(`scrolled ${target}`)
    })
    return
  }

  if (command === 'click') {
    await withPage(async (page) => {
      const locator = await getLocator(page, flags)
      await locator.click()
      const target = flags.ref
        ? `--ref ${normalizeRef(flags.ref)}`
        : `${flags.role || flags.selector} ${flags.name || ''}`.trim()
      console.log(`clicked ${target}`)
    })
    return
  }

  if (command === 'fill') {
    if (flags.value === undefined) throw new Error('fill requires --value')
    await withPage(async (page) => {
      const locator = await getLocator(page, flags)
      await locator.fill(flags.value)
      const target = flags.ref ? `--ref ${normalizeRef(flags.ref)}` : flags.name || flags.selector
      console.log(`filled ${target}`)
    })
    return
  }

  if (command === 'viewport') {
    const viewport = parseViewportFlags(flags)
    await withPage(async () => {
      console.log(
        `viewport ${viewport.width}x${viewport.height}${viewport.mobile ? ' mobile' : ''}${
          viewport.deviceScaleFactor !== 1 ? ` dsf=${viewport.deviceScaleFactor}` : ''
        }`,
      )
    })
    return
  }

  if (command === 'select') {
    if (flags.value === undefined) throw new Error('select requires --value')
    await withPage(async (page) => {
      const locator = await getLocator(page, flags)
      await locator.selectOption(flags.value)
      const target = flags.ref ? `--ref ${normalizeRef(flags.ref)}` : flags.name || flags.selector
      console.log(`selected ${target}=${flags.value}`)
    })
    return
  }

  if (command === 'press') {
    if (!flags.key) throw new Error('press requires --key')
    await withPage(async (page) => {
      await page.keyboard.press(flags.key)
      console.log(`pressed ${flags.key}`)
    })
    return
  }

  if (command === 'wait') {
    const timeout = Number(flags['timeout-ms'] || 15_000)
    await withPage(async (page) => {
      const locator = await getLocator(page, flags)
      await locator.waitFor({ timeout })
      const target = flags.ref
        ? `--ref ${normalizeRef(flags.ref)}`
        : `${flags.role || flags.selector} ${flags.name || ''}`.trim()
      console.log(`waited for ${target}`)
    })
    return
  }

  if (command === 'eval') {
    if (!flags.js) throw new Error('eval requires --js')
    if (jsLooksLikeNavigation(flags.js)) {
      throw new Error(`eval must not navigate off ${WEB_URL}`)
    }
    await withPage(async (page) => {
      const session = await page.context().newCDPSession(page)
      const result = await session.send('Runtime.evaluate', {
        expression: flags.js,
        returnByValue: true,
      })
      console.log(JSON.stringify(result, null, 2))
      await assertStayedOnApp(page, WEB_URL)
    })
    return
  }

  if (command === 'cdp') {
    if (!flags.method) throw new Error('cdp requires --method')
    if (!isAllowedCdpMethod(flags.method)) {
      throw new Error(`CDP method not allowed: ${flags.method}`)
    }
    const params = parseCdpParams(flags.params)
    if (flags.method === 'Runtime.evaluate' && jsLooksLikeNavigation(params.expression || '')) {
      throw new Error(`cdp Runtime.evaluate must not navigate off ${WEB_URL}`)
    }
    if (
      flags.method === 'Runtime.callFunctionOn' &&
      jsLooksLikeNavigation(params.functionDeclaration || '')
    ) {
      throw new Error(`cdp Runtime.callFunctionOn must not navigate off ${WEB_URL}`)
    }
    await withPage(async (page) => {
      const session = await page.context().newCDPSession(page)
      const result = await session.send(flags.method, params)
      console.log(JSON.stringify(result, null, 2))
      await assertStayedOnApp(page, WEB_URL)
    })
    return
  }

  if (command === 'console' || command === 'network') {
    await withPage(async () => {})
    printJsonlOrEmpty(command === 'console' ? consoleLogPath : networkLogPath)
    return
  }

  if (command === 'snapshot') {
    if (!flags.aria && !flags.interactive) {
      throw new Error('snapshot requires --aria or --interactive (optional --path under artifacts/verify)')
    }
    if (flags.aria && flags.interactive) {
      throw new Error('snapshot accepts only one of --aria or --interactive')
    }
    await withPage(async (page) => {
      let text
      if (flags.interactive) {
        const entries = await collectInteractiveElements(page)
        text = `${entries.map(formatInteractiveLine).join('\n')}\n`
      } else {
        const snapshot = await page.locator('body').ariaSnapshot()
        text = snapshot.endsWith('\n') ? snapshot : `${snapshot}\n`
      }
      if (!flags.path) {
        process.stdout.write(text)
        return
      }
      const outPath = resolveEvidencePath(flags.path)
      ensureDir(path.dirname(outPath))
      fs.writeFileSync(outPath, text)
      console.log(`wrote ${outPath}`)
    })
    return
  }

  if (command === 'screenshot') {
    if (!flags.path) throw new Error('screenshot requires --path')
    const outPath = resolveEvidencePath(flags.path)
    ensureDir(path.dirname(outPath))
    await withPage(async (page) => {
      await page.screenshot({ path: outPath, fullPage: Boolean(flags['full-page']) })
      console.log(`wrote ${outPath}`)
    })
    return
  }

  throw new Error(`unknown browser command: ${command}`)
}
