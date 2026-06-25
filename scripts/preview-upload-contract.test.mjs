import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_PREVIEW_ALIAS_LEN,
  isValidPreviewAlias,
  resolvePreviewAlias,
  sanitizePreviewAlias,
} from './preview-upload.mjs'

test('preview alias max length fits worker DNS label budget', () => {
  assert.equal(MAX_PREVIEW_ALIAS_LEN, 42)
})

test('sanitizePreviewAlias normalizes branch names', () => {
  assert.equal(
    sanitizePreviewAlias('cursor/mobile-federal-control-text-0444'),
    'cursor-mobile-federal-control-text-0444',
  )
  assert.equal(sanitizePreviewAlias('feature/2-redesign'), 'feature-2-redesign')
})

test('isValidPreviewAlias rejects leading digits and empty strings', () => {
  assert.equal(isValidPreviewAlias(''), false)
  assert.equal(isValidPreviewAlias('2-redesign'), false)
  assert.equal(isValidPreviewAlias('cursor-mobile-federal-control-text-0444'), true)
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
