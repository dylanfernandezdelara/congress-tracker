import { describe, expect, it } from 'vitest'

import { markdownToPlainText } from './markdown-plain-text'

describe('markdownToPlainText', () => {
  it('removes paired delimiters, link syntax, and block prefixes', () => {
    const markdown = [
      '## Summary',
      '',
      'The bill **raises** the _cap_, ~~cuts~~ adds `audits`:',
      '',
      '1. A [two-year deadline](https://example.gov/x) for reviews.',
      '> Agencies ***must*** report.',
    ].join('\n')
    expect(markdownToPlainText(markdown)).toBe(
      [
        'Summary',
        '',
        'The bill raises the cap, cuts adds audits:',
        '',
        'A two-year deadline for reviews.',
        'Agencies must report.',
      ].join('\n'),
    )
  })

  it('keeps marks that render literally', () => {
    expect(markdownToPlainText('Agencies report \\*quarterly\\*.')).toBe('Agencies report *quarterly*.')
    expect(markdownToPlainText('a snake_case_field and 2 * 3 * 4')).toBe('a snake_case_field and 2 * 3 * 4')
    expect(markdownToPlainText('an unclosed **bold run')).toBe('an unclosed **bold run')
  })

  it('leaves code-span bodies untouched by the later stages', () => {
    expect(markdownToPlainText('Use `**not bold**` in the statute.')).toBe('Use **not bold** in the statute.')
    expect(markdownToPlainText('See `_status_` and `\\*` reports.')).toBe('See _status_ and \\* reports.')
    expect(markdownToPlainText('`- item` is not a list')).toBe('- item is not a list')
  })

  it('keeps an escaped mark beside real emphasis and stars inside link text', () => {
    expect(markdownToPlainText('rate \\**x*')).toBe('rate *x')
    expect(markdownToPlainText('[a * b](https://example.gov)')).toBe('a * b')
  })

  it('never emits placeholder scalars or "undefined" for private-use input', () => {
    const out = markdownToPlainText('The bill raises the cap. \uE013\uE002 extra words **here**')
    expect(out).toBe('The bill raises the cap.  extra words here')
    expect(out).not.toMatch(/undefined|[\uE000-\uE0FF]/)
  })
})
