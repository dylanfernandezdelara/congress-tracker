import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = path.join(rootDir, 'scripts', 'setup-origin-remote.sh')
const githubUrl = 'https://github.com/dylanfernandezdelara/congress-tracker.git'
const originUrl = 'https://origin.cursor.com/example-codebase/congress-tracker.git'

function isolatedGitEnv() {
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
  }
}

function initRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-remote-'))
  const env = isolatedGitEnv()
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, env })
  execFileSync('git', ['config', 'user.email', 'dev@example.com'], { cwd: dir, env })
  execFileSync('git', ['config', 'user.name', 'Dev'], { cwd: dir, env })
  return dir
}

function remotes(dir) {
  return execFileSync('git', ['remote', '-v'], {
    cwd: dir,
    encoding: 'utf8',
    env: isolatedGitEnv(),
  })
}

function runScript(dir, env = {}) {
  return execFileSync('bash', [scriptPath], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...isolatedGitEnv(), ...env },
  })
}

test('setup-origin-remote adds GitHub origin when no remotes exist', () => {
  const dir = initRepo()
  const output = runScript(dir)

  assert.match(output, /added origin -> /)
  assert.match(remotes(dir), /origin\s+https:\/\/github\.com\/dylanfernandezdelara\/congress-tracker\.git/)
})

test('setup-origin-remote adds cursor remote without replacing GitHub origin', () => {
  const dir = initRepo()
  execFileSync('git', ['remote', 'add', 'origin', githubUrl], {
    cwd: dir,
    env: isolatedGitEnv(),
  })

  const output = runScript(dir, { ORIGIN_REPO_URL: originUrl })

  assert.match(output, /added cursor -> /)
  const listed = remotes(dir)
  assert.match(listed, /origin\s+https:\/\/github\.com\/dylanfernandezdelara\/congress-tracker\.git/)
  assert.match(listed, /cursor\s+https:\/\/origin\.cursor\.com\/example-codebase\/congress-tracker\.git/)
})

test('setup-origin-remote adds github remote when origin already points at Origin', () => {
  const dir = initRepo()
  execFileSync('git', ['remote', 'add', 'origin', originUrl], {
    cwd: dir,
    env: isolatedGitEnv(),
  })

  const output = runScript(dir)

  assert.match(output, /added github -> /)
  const listed = remotes(dir)
  assert.match(listed, /origin\s+https:\/\/origin\.cursor\.com\/example-codebase\/congress-tracker\.git/)
  assert.match(listed, /github\s+https:\/\/github\.com\/dylanfernandezdelara\/congress-tracker\.git/)
})

test('setup-origin-remote refuses a non-Origin ORIGIN_REPO_URL', () => {
  const dir = initRepo()
  execFileSync('git', ['remote', 'add', 'origin', githubUrl], {
    cwd: dir,
    env: isolatedGitEnv(),
  })

  assert.throws(
    () => runScript(dir, { ORIGIN_REPO_URL: githubUrl }),
    /ORIGIN_REPO_URL must be an Origin URL/,
  )
  assert.doesNotMatch(remotes(dir), /cursor\s+/)
})

test('setup-origin-remote does not overwrite an existing Origin remote', () => {
  const dir = initRepo()
  execFileSync('git', ['remote', 'add', 'origin', githubUrl], {
    cwd: dir,
    env: isolatedGitEnv(),
  })
  execFileSync('git', ['remote', 'add', 'cursor', originUrl], {
    cwd: dir,
    env: isolatedGitEnv(),
  })

  const output = runScript(dir, {
    ORIGIN_REPO_URL: 'https://origin.cursor.com/other/congress-tracker.git',
  })

  assert.match(output, /kept existing Origin remote cursor/)
  assert.match(remotes(dir), /cursor\s+https:\/\/origin\.cursor\.com\/example-codebase\/congress-tracker\.git/)
})

test('docs keep GitHub as the Cloudflare deploy trigger', () => {
  const originDoc = fs.readFileSync(path.join(rootDir, 'docs', 'ORIGIN.md'), 'utf8')
  const agents = fs.readFileSync(path.join(rootDir, 'AGENTS.md'), 'utf8')
  const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8')
  const preview = fs.readFileSync(path.join(rootDir, 'docs', 'PREVIEW_DEPLOYMENTS.md'), 'utf8')
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

  assert.match(originDoc, /Do \*\*not\*\* replace the GitHub remote/)
  assert.match(originDoc, /Detach from GitHub/)
  assert.match(originDoc, /Workers Builds/)
  assert.match(originDoc, /dylanfernandezdelara\/congress-tracker/)
  assert.match(agents, /docs\/ORIGIN\.md/)
  assert.match(agents, /Sync from GitHub/)
  assert.match(readme, /docs\/ORIGIN\.md/)
  assert.match(preview, /GitHub repository/)
  assert.equal(packageJson.scripts['remotes:origin'], './scripts/setup-origin-remote.sh')
})

test('setup-origin-remote redacts credentials when adding remotes', () => {
  const dir = initRepo()
  const output = runScript(dir, {
    GITHUB_REPO_URL: 'https://x-access-token:SUPERSECRET@github.com/dylanfernandezdelara/congress-tracker.git',
    ORIGIN_REPO_URL: 'https://user:ORIGINSECRET@origin.cursor.com/example-codebase/congress-tracker.git',
  })

  assert.match(output, /added origin -> https:\/\/github\.com\/dylanfernandezdelara\/congress-tracker\.git/)
  assert.match(output, /added cursor -> https:\/\/origin\.cursor\.com\/example-codebase\/congress-tracker\.git/)
  assert.doesNotMatch(output, /SUPERSECRET/)
  assert.doesNotMatch(output, /ORIGINSECRET/)
})

test('setup-origin-remote refuses a non-GitHub GITHUB_REPO_URL', () => {
  const dir = initRepo()

  assert.throws(
    () => runScript(dir, { GITHUB_REPO_URL: 'https://evil.example/fake.git' }),
    /GITHUB_REPO_URL must be a GitHub URL/,
  )
  assert.doesNotMatch(remotes(dir), /origin\s+/)
})
