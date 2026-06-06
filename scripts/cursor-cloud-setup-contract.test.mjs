import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const setupScript = path.join(rootDir, 'scripts', 'cursor-cloud-setup.sh')
const devVarsExample = path.join(rootDir, 'workers', 'senate_data_worker', '.dev.vars.example')

const read = (file) => fs.readFileSync(file, 'utf8')

function runSetupFixture({ env = {}, existingDevVars } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-cloud-setup-'))
  const scriptsDir = path.join(dir, 'scripts')
  const workerDir = path.join(dir, 'workers', 'senate_data_worker')
  const webDir = path.join(dir, 'web')
  const binDir = path.join(dir, 'bin')
  fs.mkdirSync(scriptsDir, { recursive: true })
  fs.mkdirSync(workerDir, { recursive: true })
  fs.mkdirSync(webDir, { recursive: true })
  fs.mkdirSync(binDir, { recursive: true })

  const fixtureSetupScript = path.join(scriptsDir, 'cursor-cloud-setup.sh')
  const fixtureDevVars = path.join(workerDir, '.dev.vars')
  fs.copyFileSync(setupScript, fixtureSetupScript)
  fs.copyFileSync(devVarsExample, path.join(workerDir, '.dev.vars.example'))
  if (existingDevVars !== undefined) {
    fs.writeFileSync(fixtureDevVars, existingDevVars, 'utf8')
  }

  const fakeNpm = path.join(binDir, 'npm')
  fs.writeFileSync(fakeNpm, '#!/usr/bin/env bash\nexit 0\n', 'utf8')
  fs.chmodSync(fakeNpm, 0o755)

  const output = execFileSync('bash', [fixtureSetupScript], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      CONGRESS_API_KEY: '',
      GOVINFO_API_KEY: '',
      DATA_SOURCE: '',
      REPLAY_FIXTURE_SET: '',
      CLOCK: '',
      ALLOWED_ORIGIN: '',
      PIPELINE_ADMIN_TOKEN: '',
      ...env,
    },
  })

  return { output, devVars: read(fixtureDevVars) }
}

test('cursor-cloud setup overlays only API secrets from the environment', () => {
  const { output, devVars } = runSetupFixture({
    env: {
      CONGRESS_API_KEY: 'abc#123 def',
      GOVINFO_API_KEY: 'line1\nline2"ok',
      DATA_SOURCE: 'live',
      REPLAY_FIXTURE_SET: 'other',
      CLOCK: '2030-01-01T00:00:00Z',
      ALLOWED_ORIGIN: 'https://example.com',
      PIPELINE_ADMIN_TOKEN: 'pipeline-token',
    },
  })

  assert.match(devVars, /^DATA_SOURCE=replay$/m)
  assert.match(devVars, /^REPLAY_FIXTURE_SET=canonical$/m)
  assert.match(devVars, /^ALLOWED_ORIGIN=\*$/m)
  assert.doesNotMatch(devVars, /^PIPELINE_ADMIN_TOKEN=/m)
  assert.match(devVars, /^CONGRESS_API_KEY="abc#123 def"$/m)
  assert.ok(devVars.includes('GOVINFO_API_KEY="line1\\nline2\\"ok"\n'))
  assert.doesNotMatch(output, /abc#123|line1|pipeline-token/)
})

test('cursor-cloud setup updates API keys without rewriting local mode', () => {
  const { devVars } = runSetupFixture({
    existingDevVars: ['DATA_SOURCE=live', 'CONGRESS_API_KEY=old', 'CUSTOM_TUNING=42', ''].join('\n'),
    env: {
      CONGRESS_API_KEY: 'rotated-key',
      DATA_SOURCE: 'replay',
    },
  })

  assert.match(devVars, /^DATA_SOURCE=live$/m)
  assert.match(devVars, /^CUSTOM_TUNING=42$/m)
  assert.match(devVars, /^CONGRESS_API_KEY="rotated-key"$/m)
  assert.doesNotMatch(devVars, /^GOVINFO_API_KEY=/m)
})

test('.dev.vars.example documents secrets without placeholder values', () => {
  const example = read(devVarsExample)
  assert.match(example, /^# CONGRESS_API_KEY=$/m)
  assert.match(example, /^# GOVINFO_API_KEY=$/m)
  assert.doesNotMatch(example, /^CONGRESS_API_KEY=/m)
  assert.doesNotMatch(example, /^GOVINFO_API_KEY=/m)
})
