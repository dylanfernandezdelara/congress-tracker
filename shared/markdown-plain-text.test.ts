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

  it('drops the whole destination, parens and title included, and only then the link', () => {
    expect(
      markdownToPlainText(
        '[the coverage rules](https://en.wikipedia.org/wiki/Foo_(Bar) "do not apply here") extra words.',
      ),
    ).toBe('the coverage rules extra words.')
    expect(
      markdownToPlainText(
        '[Medicare](https://en.wikipedia.org/wiki/Medicare_(United_States)_and_Medicaid) covers seniors.',
      ),
    ).toBe('Medicare covers seniors.')
    expect(markdownToPlainText("[CMS](https://x.gov 'see (Title I) details') acts.")).toBe('CMS acts.')
    expect(markdownToPlainText('[a](<https://x.gov/a b> (paren title)) rest')).toBe('a rest')
    expect(markdownToPlainText('[a](  https://x.gov/a\n"two\nlines"  ) rest')).toBe('a rest')
  })

  it('leaves text that only looks like a link exactly as CommonMark would show it', () => {
    // An unbalanced or trailing-junk destination is not a link, so the raw
    // characters are what the reader sees; folding them would invent prose.
    const malformed = '[The bill does not apply](https://x.gov/Foo_(Bar) to Title II programs) today.'
    expect(markdownToPlainText(malformed)).toBe(malformed)
    expect(markdownToPlainText('[a](https://x.gov/(open rest')).toBe('[a](https://x.gov/(open rest')
    expect(markdownToPlainText('[a] b](https://x.gov) rest')).toBe('[a] b](https://x.gov) rest')
    expect(markdownToPlainText('see \\[not](a link\\) here')).toBe('see [not](a link) here')
  })

  it('restores each code span by identity when a link destination swallows one', () => {
    // The destination is not rendered, so its span must vanish without
    // handing its body to the next span (which is what the reader sees).
    expect(
      markdownToPlainText('See [CMS](`Title I`) — the bill does not apply to `Title II` programs extra.'),
    ).toBe('See CMS — the bill does not apply to Title II programs extra.')
  })

  it('never emits placeholder scalars or "undefined" for private-use input', () => {
    const out = markdownToPlainText('The bill raises the cap. \uE013\uE002\uE100\uF8FF extra words **here**')
    expect(out).toBe('The bill raises the cap.  extra words here')
    expect(out).not.toMatch(/undefined|[\uE000-\uF8FF]/)
  })
})
