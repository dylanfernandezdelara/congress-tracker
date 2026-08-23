import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scanScript = path.join(rootDir, 'scripts', 'scan-history-secrets.sh')
const allowPath = path.join(rootDir, 'scripts', 'trufflehog-allow.json')
const senateBrowserTest = path.join(
  rootDir,
  'workers/senate_data_worker/src/sources/senate-browser-xml.test.ts',
)

test('history secret scan is wired and executable', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
  assert.equal(packageJson.scripts['public:scan:history-secrets'], './scripts/scan-history-secrets.sh')
  const stat = fs.statSync(scanScript)
  assert.ok((stat.mode & 0o111) !== 0, 'scan-history-secrets.sh should be executable')
})

test('history scan allowlists known test fixtures and stays on the current branch', () => {
  const script = fs.readFileSync(scanScript, 'utf8')
  const allow = JSON.parse(fs.readFileSync(allowPath, 'utf8'))
  assert.match(script, /--allow/)
  assert.match(script, /--branch/)
  assert.match(script, /trufflehog-allow\.json/)
  assert.equal(
    allow['senate-lis-credential-url-fixture'],
    'https://user:pass@www.senate.gov/legislative/LIS/roll_call_lists/x.xml',
  )
})

test('current Senate browser tests do not embed a password-in-URL literal', () => {
  const source = fs.readFileSync(senateBrowserTest, 'utf8')
  assert.doesNotMatch(source, /https:\/\/user:pass@/)
  assert.match(source, /credentialed\.username/)
  assert.match(source, /credentialed\.password/)
})
