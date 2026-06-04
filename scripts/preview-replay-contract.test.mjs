import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const harnessEnv = path.join(rootDir, 'scripts', 'harness-env.sh')
const harnessLib = path.join(rootDir, 'scripts', 'lib', 'harness.sh')
const previewScript = path.join(rootDir, 'scripts', 'preview-replay.sh')
const harnessCi = path.join(rootDir, 'scripts', 'harness-ci.sh')
const publicReadiness = path.join(rootDir, 'scripts', 'public-readiness-check.sh')
const gitignore = path.join(rootDir, '.gitignore')

const read = (file) => fs.readFileSync(file, 'utf8')

test('package.json exposes preview:replay without docs snapshot scripts', () => {
  const pkg = JSON.parse(read(packageJsonPath))
  assert.equal(pkg.scripts['preview:replay'], './scripts/preview-replay.sh')
  assert.equal(pkg.scripts['docs:snapshots'], undefined)
  assert.equal(pkg.scripts['screenshot:replay'], undefined)
})

test('harness-env.sh centralizes replay vote detail paths', () => {
  const text = read(harnessEnv)
  assert.match(text, /HARNESS_EXPECTED_VOTE_DETAIL_PATH=/)
  assert.match(text, /HARNESS_EXPECTED_VOTE_DETAIL_API_PATH=/)
  assert.match(text, /HARNESS_EXPECTED_VOTE_ID/)
  assert.doesNotMatch(text, /HARNESS_REPLAY_SCREENSHOT/)
  assert.doesNotMatch(text, /HARNESS_DOCS_SCREENSHOT/)
})

test('harness.sh starts replay worker with explicit fixture vars', () => {
  const text = read(harnessLib)
  assert.match(text, /--var "DATA_SOURCE:replay"/)
  assert.match(text, /--var "REPLAY_FIXTURE_SET:\$\{REPLAY_FIXTURE_SET\}"/)
  assert.match(text, /harness_bootstrap_replay_stack/)
  assert.match(text, /harness_assert_replay_api/)
})

test('harness-ci.sh and preview-replay.sh source harness-env and use shared bootstrap', () => {
  for (const [label, file] of [
    ['harness-ci.sh', harnessCi],
    ['preview-replay.sh', previewScript],
  ]) {
    const text = read(file)
    assert.match(text, /harness-env\.sh/, `${label} must source harness-env.sh`)
    assert.match(text, /harness_bootstrap_replay_stack/, `${label} must call harness_bootstrap_replay_stack`)
    assert.doesNotMatch(text, /curl[^\n]*\|\| true/, `${label} must not swallow ingestion failures`)
  }

  const ci = read(harnessCi)
  assert.match(ci, /after-web/)

  const preview = read(previewScript)
  assert.match(preview, /before-web/)
  assert.match(preview, /HARNESS_PREVIEW_ROOT/)
  assert.match(preview, /HARNESS_EXPECTED_VOTE_DETAIL_PATH/)
  assert.doesNotMatch(preview, /ui:snap|\.png|screenshot\(/i, 'preview must not write PNGs')
})

test('no docs/screenshots PNGs are tracked in git', () => {
  const tracked = execFileSync('git', ['ls-files', 'docs/screenshots'], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim()
  const pngs = tracked.split('\n').filter((line) => line.endsWith('.png'))
  assert.deepEqual(pngs, [], `tracked docs screenshot PNGs must be absent: ${pngs.join(', ')}`)
})

test('public-readiness-check rejects tracked docs/screenshots PNGs', () => {
  const text = read(publicReadiness)
  assert.match(text, /docs\/screenshots\/\*\.png/)
  assert.match(read(gitignore), /^docs\/screenshots\/$/m)
})
