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

function runSetupFixture({ existingDevVars } = {}) {
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
    },
  })

  return { output, devVars: read(fixtureDevVars) }
}

test('cursor-cloud setup creates .dev.vars from example when missing', () => {
  const { devVars } = runSetupFixture()

  assert.match(devVars, /^ALLOWED_ORIGIN=\*$/m)
})

test('cursor-cloud setup does not overwrite an existing .dev.vars', () => {
  const { devVars } = runSetupFixture({
    existingDevVars: ['ALLOWED_ORIGIN=https://example.com', ''].join('\n'),
  })

  assert.match(devVars, /^ALLOWED_ORIGIN=https:\/\/example\.com$/m)
})

test('.dev.vars.example documents local CORS without secrets', () => {
  const example = read(devVarsExample)
  assert.match(example, /^ALLOWED_ORIGIN=\*$/m)
  const secretPrefixes = ['CONGRESS_API_KEY', 'GOVINFO_API_KEY']
  for (const prefix of secretPrefixes) {
    assert.ok(!example.split('\n').some((line) => line.startsWith(`${prefix}=`)))
  }
})
