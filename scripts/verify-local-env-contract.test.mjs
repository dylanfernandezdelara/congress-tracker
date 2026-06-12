import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const verifyScript = path.join(rootDir, 'scripts', 'verify-local-env.sh')

function runVerify({ withDeps, withDevVars } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-local-env-'))
  const scriptsDir = path.join(dir, 'scripts')
  const workerDir = path.join(dir, 'workers', 'senate_data_worker')
  const webDir = path.join(dir, 'web')
  fs.mkdirSync(scriptsDir, { recursive: true })
  fs.mkdirSync(workerDir, { recursive: true })
  fs.mkdirSync(webDir, { recursive: true })
  fs.copyFileSync(verifyScript, path.join(scriptsDir, 'verify-local-env.sh'))
  fs.writeFileSync(path.join(dir, '.nvmrc'), '20\n', 'utf8')

  if (withDeps) {
    for (const d of [dir, workerDir, webDir]) {
      fs.mkdirSync(path.join(d, 'node_modules'), { recursive: true })
    }
  }
  if (withDevVars) {
    fs.writeFileSync(path.join(workerDir, '.dev.vars'), 'ALLOWED_ORIGIN=*\n', 'utf8')
  }

  try {
    const stdout = execFileSync('bash', [path.join(scriptsDir, 'verify-local-env.sh')], {
      cwd: dir,
      encoding: 'utf8',
      // Point the optional worker probe at an unused port so it stays a warning.
      env: { ...process.env, WORKER_URL: 'http://127.0.0.1:9' },
    })
    return { code: 0, stdout }
  } catch (err) {
    return { code: err.status ?? 1, stdout: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

test('verify script exists and is executable', () => {
  const stat = fs.statSync(verifyScript)
  assert.ok(stat.isFile())
  assert.ok((stat.mode & 0o111) !== 0, 'verify script should be executable')
})

test('fails when dependencies are missing and points to npm run setup', () => {
  const { code, stdout } = runVerify({ withDeps: false, withDevVars: false })
  assert.notEqual(code, 0, 'missing dependencies should be a hard failure')
  assert.match(stdout, /npm run setup/)
})

test('passes when deps and .dev.vars are present', () => {
  const { code, stdout } = runVerify({ withDeps: true, withDevVars: true })
  assert.equal(code, 0)
  assert.match(stdout, /Local environment looks ready/)
})

test('warns (not fails) when .dev.vars is missing but deps are installed', () => {
  const { code, stdout } = runVerify({ withDeps: true, withDevVars: false })
  assert.equal(code, 0, 'missing .dev.vars should be a warning, not a hard failure')
  assert.match(stdout, /npm run seed/)
})
