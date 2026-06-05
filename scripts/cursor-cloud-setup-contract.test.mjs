import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devVarsLib = path.join(rootDir, 'scripts', 'lib', 'dev-vars.sh')
const setupScript = path.join(rootDir, 'scripts', 'cursor-cloud-setup.sh')
const agentsMd = path.join(rootDir, 'AGENTS.md')
const devVarsExample = path.join(
  rootDir,
  'workers',
  'senate_data_worker',
  '.dev.vars.example',
)

const read = (file) => fs.readFileSync(file, 'utf8')

const bashQuote = (value) => `'${value.replace(/'/g, `'\"'\"'`)}'`

const runBash = (script, env = {}) =>
  execFileSync('bash', ['-c', script], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })

const parseBridgedVars = () => {
  const text = read(devVarsLib)
  const match = text.match(/BRIDGED_VARS=\(\s*([\s\S]*?)\s*\)/)
  assert.ok(match, 'BRIDGED_VARS array must exist in scripts/lib/dev-vars.sh')
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

test('BRIDGED_VARS is documented in AGENTS.md and .dev.vars.example', () => {
  const bridged = parseBridgedVars()
  const agents = read(agentsMd)
  const example = read(devVarsExample)

  assert.match(agents, /BRIDGED_VARS.*scripts\/lib\/dev-vars\.sh/)
  assert.match(example, /scripts\/cursor-cloud-setup\.sh/)

  for (const key of bridged) {
    assert.match(example, new RegExp(key), `.dev.vars.example must mention ${key}`)
  }
})

test('cursor-cloud-setup.sh sources shared dev-vars helpers', () => {
  const text = read(setupScript)
  assert.match(text, /source .*scripts\/lib\/dev-vars\.sh/)
  assert.match(text, /bridge_dev_vars_from_env/)
  assert.doesNotMatch(text, /^BRIDGED_VARS=/m, 'setup script must not duplicate BRIDGED_VARS')
})

test('dotenv_quote escapes dotenv metacharacters', () => {
  const cases = [
    ['abc#123 def', '"abc#123 def"'],
    ['k"ey', '"k\\"ey"'],
    ['line1\nline2', '"line1\\nline2"'],
    ['cr\rnl', '"crnl"'],
    ['back\\slash', '"back\\\\slash"'],
  ]

  for (const [input, expected] of cases) {
    const out = runBash(
      `source ${bashQuote(devVarsLib)}; dotenv_quote ${bashQuote(input)}`,
    ).trim()
    assert.equal(out, expected, `dotenv_quote(${JSON.stringify(input)})`)
  }
})

test('bridge_dev_vars_from_env upserts, removes stale bridged keys, and preserves hand edits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-vars-bridge-'))
  const devVars = path.join(dir, '.dev.vars')
  const stateFile = path.join(dir, '.dev.vars.bridged')

  fs.writeFileSync(
    devVars,
    [
      'DATA_SOURCE=replay',
      'CONGRESS_API_KEY=hand-edited-local-key',
      'CUSTOM_TUNING=42',
    ].join('\n'),
    'utf8',
  )

  runBash(
    `
      source ${bashQuote(devVarsLib)}
      for v in DATA_SOURCE REPLAY_FIXTURE_SET CLOCK ALLOWED_ORIGIN CONGRESS_API_KEY GOVINFO_API_KEY PIPELINE_ADMIN_TOKEN; do
        unset "$v"
      done
      export DATA_SOURCE='live'
      export CONGRESS_API_KEY='from-env-abc#token'
      export PIPELINE_ADMIN_TOKEN='  '
      bridge_dev_vars_from_env ${bashQuote(devVars)} ${bashQuote(stateFile)} >/dev/null
    `,
  )

  const afterBridge = read(devVars)
  assert.match(afterBridge, /^DATA_SOURCE="live"$/m)
  assert.match(afterBridge, /^CONGRESS_API_KEY="from-env-abc#token"$/m)
  assert.doesNotMatch(afterBridge, /PIPELINE_ADMIN_TOKEN=/)
  assert.match(afterBridge, /^CUSTOM_TUNING=42$/m)
  assert.deepEqual(read(stateFile).trim().split('\n').sort(), ['CONGRESS_API_KEY', 'DATA_SOURCE'])

  runBash(
    `
      source ${bashQuote(devVarsLib)}
      for v in DATA_SOURCE REPLAY_FIXTURE_SET CLOCK ALLOWED_ORIGIN CONGRESS_API_KEY GOVINFO_API_KEY PIPELINE_ADMIN_TOKEN; do
        unset "$v"
      done
      export CONGRESS_API_KEY='rotated-key'
      bridge_dev_vars_from_env ${bashQuote(devVars)} ${bashQuote(stateFile)} >/dev/null
    `,
  )

  const afterUnset = read(devVars)
  assert.doesNotMatch(afterUnset, /^DATA_SOURCE=/m)
  assert.match(afterUnset, /^CONGRESS_API_KEY="rotated-key"$/m)
  assert.match(afterUnset, /^CUSTOM_TUNING=42$/m)

  runBash(
    `
      source ${bashQuote(devVarsLib)}
      for v in DATA_SOURCE REPLAY_FIXTURE_SET CLOCK ALLOWED_ORIGIN CONGRESS_API_KEY GOVINFO_API_KEY PIPELINE_ADMIN_TOKEN; do
        unset "$v"
      done
      bridge_dev_vars_from_env ${bashQuote(devVars)} ${bashQuote(stateFile)} >/dev/null
    `,
  )

  const afterSecretClear = read(devVars)
  assert.doesNotMatch(afterSecretClear, /^CONGRESS_API_KEY=/m)
  assert.match(afterSecretClear, /^CUSTOM_TUNING=42$/m)
})

test('upsert_dev_var_in_file replaces whitespace-padded duplicate keys', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-vars-upsert-'))
  const devVars = path.join(dir, '.dev.vars')
  fs.writeFileSync(devVars, ' CONGRESS_API_KEY=old\nKEEP=yes\n', 'utf8')

  runBash(
    `
      source ${bashQuote(devVarsLib)}
      upsert_dev_var_in_file ${bashQuote(devVars)} CONGRESS_API_KEY 'new#key'
    `,
  )

  const text = read(devVars)
  assert.match(text, /^CONGRESS_API_KEY="new#key"$/m)
  assert.doesNotMatch(text, / CONGRESS_API_KEY=/)
  assert.match(text, /^KEEP=yes$/m)
})
