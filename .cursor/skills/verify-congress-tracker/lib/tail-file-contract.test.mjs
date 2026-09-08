import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { tailFile } from './tail-file.mjs'

test('tailFile returns empty string for missing, empty, or invalid input', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tail-file-'))
  try {
    assert.equal(tailFile(path.join(dir, 'missing.log'), 15), '')
    const emptyPath = path.join(dir, 'empty.log')
    fs.writeFileSync(emptyPath, '', 'utf8')
    assert.equal(tailFile(emptyPath, 15), '')
    assert.equal(tailFile('', 15), '')
    assert.equal(tailFile(emptyPath, 0), '')
    assert.equal(tailFile(emptyPath, -1), '')
    assert.equal(tailFile(emptyPath, 1.5), '')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('tailFile returns the last N lines and drops a trailing newline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tail-file-'))
  try {
    const filePath = path.join(dir, 'worker.log')
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`)
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
    assert.equal(tailFile(filePath, 15), lines.slice(-15).join('\n'))
    assert.equal(tailFile(filePath, 3), 'line-18\nline-19\nline-20')
    assert.equal(tailFile(filePath, 50), lines.join('\n'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
