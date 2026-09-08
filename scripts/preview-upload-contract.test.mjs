import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  MAX_PREVIEW_ALIAS_LEN,
  isValidPreviewAlias,
  resolvePreviewAlias,
  sanitizePreviewAlias,
  webDistBuildProblem,
} from './preview-upload.mjs'

test('webDistBuildProblem rejects missing and placeholder web/dist, accepts a Vite build', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-upload-dist-'))
  try {
    assert.match(webDistBuildProblem(dir), /missing/)
    fs.mkdirSync(path.join(dir, 'web', 'dist'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'web', 'dist', 'index.html'), '<!DOCTYPE html>\n', 'utf8')
    assert.match(webDistBuildProblem(dir), /placeholder shell/)
    fs.mkdirSync(path.join(dir, 'web', 'dist', 'assets'))
    assert.equal(webDistBuildProblem(dir), '')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('preview alias max length fits preview worker DNS label budget', () => {
  assert.equal(MAX_PREVIEW_ALIAS_LEN, 34)
})

test('sanitizePreviewAlias normalizes branch names', () => {
  assert.equal(
    sanitizePreviewAlias('cursor/mobile-federal-control-text-0444'),
    'cursor-mobile-federal-control-text',
  )
  assert.equal(sanitizePreviewAlias('feature/2-redesign'), 'feature-2-redesign')
})

test('isValidPreviewAlias rejects leading digits and empty strings', () => {
  assert.equal(isValidPreviewAlias(''), false)
  assert.equal(isValidPreviewAlias('2-redesign'), false)
  assert.equal(isValidPreviewAlias('cursor-mobile-federal-control-text'), true)
})

test('sanitizePreviewAlias truncates over-long branch names', () => {
  const long = 'cursor-' + 'a'.repeat(80)
  const sanitized = sanitizePreviewAlias(long)
  assert.equal(sanitized.length, MAX_PREVIEW_ALIAS_LEN)
  assert.equal(isValidPreviewAlias(sanitized), true)
})

test('sanitizePreviewAlias strips trailing dash after truncation', () => {
  const long = 'cursor-' + 'a'.repeat(35) + '-tail'
  const sanitized = sanitizePreviewAlias(long)
  assert.equal(sanitized.length, MAX_PREVIEW_ALIAS_LEN)
  assert.match(sanitized, /[a-z0-9]$/)
  assert.equal(isValidPreviewAlias(sanitized), true)
})

test('resolvePreviewAlias skips main and honors PREVIEW_ALIAS override', () => {
  assert.equal(resolvePreviewAlias('main'), '')
  assert.equal(
    resolvePreviewAlias('cursor/foo', 'my-custom-alias'),
    'my-custom-alias',
  )
})
