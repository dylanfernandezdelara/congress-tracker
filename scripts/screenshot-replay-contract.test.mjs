import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const harnessEnv = path.join(rootDir, 'scripts', 'harness-env.sh')
const harnessLib = path.join(rootDir, 'scripts', 'lib', 'harness.sh')
const screenshotScript = path.join(rootDir, 'scripts', 'screenshot-replay.sh')
const docsScript = path.join(rootDir, 'scripts', 'docs-snapshots.sh')
const harnessCi = path.join(rootDir, 'scripts', 'harness-ci.sh')

const read = (file) => fs.readFileSync(file, 'utf8')

test('harness-env.sh centralizes replay screenshot filenames and vote detail path', () => {
  const text = read(harnessEnv)
  assert.match(text, /HARNESS_REPLAY_SCREENSHOT_HOMEPAGE_NAME=.*replay-homepage-mobile\.png/)
  assert.match(text, /HARNESS_REPLAY_SCREENSHOT_VOTE_DETAIL_NAME=.*replay-vote-detail-mobile\.png/)
  assert.match(text, /HARNESS_EXPECTED_VOTE_DETAIL_PATH=/)
  assert.match(text, /HARNESS_EXPECTED_VOTE_ID/)
})

test('harness.sh starts replay worker with explicit fixture vars', () => {
  const text = read(harnessLib)
  assert.match(text, /--var "DATA_SOURCE:replay"/)
  assert.match(text, /--var "REPLAY_FIXTURE_SET:\$\{REPLAY_FIXTURE_SET\}"/)
  assert.match(text, /harness_bootstrap_replay_stack/)
  assert.match(text, /harness_assert_replay_api/)
})

test('harness-ci.sh and screenshot-replay.sh source harness-env and use shared bootstrap', () => {
  for (const [label, file] of [
    ['harness-ci.sh', harnessCi],
    ['screenshot-replay.sh', screenshotScript],
  ]) {
    const text = read(file)
    assert.match(text, /harness-env\.sh/, `${label} must source harness-env.sh`)
    assert.match(text, /harness_bootstrap_replay_stack/, `${label} must call harness_bootstrap_replay_stack`)
    assert.doesNotMatch(text, /curl[^\n]*\|\| true/, `${label} must not swallow ingestion failures`)
  }

  const ci = read(harnessCi)
  assert.match(ci, /after-web/)
  assert.match(ci, /harness_assert_replay_api|after-web/)

  const shot = read(screenshotScript)
  assert.match(shot, /before-web/)
  assert.match(shot, /HARNESS_REPLAY_SCREENSHOT_HOMEPAGE_PATH/)
  assert.match(shot, /HARNESS_EXPECTED_VOTE_DETAIL_PATH/)
  assert.match(shot, /ASSERT_TEXT=.*HARNESS_EXPECTED_VOTE_TITLE/)
  assert.doesNotMatch(shot, /CLOCK=.*ui:snap/, 'must not pass unused CLOCK into snapshot')
})

test('docs-snapshots.sh uses harness-env paths and invokes hermetic replay flow', () => {
  const text = read(docsScript)
  assert.match(text, /harness-env\.sh/)
  assert.match(text, /screenshot-replay\.sh/)
  assert.match(text, /HARNESS_REPLAY_SCREENSHOT_HOMEPAGE_PATH/)
  assert.match(text, /HARNESS_DOCS_REPLAY_SCREENSHOT_HOMEPAGE_PATH/)
  assert.doesNotMatch(text, /\bfind\b[^\n]*\|[^\n]*\bhead\b/, 'must not pick screenshots with find|head')
})
