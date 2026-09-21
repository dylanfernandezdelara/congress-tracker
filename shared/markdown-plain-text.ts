/**
 * Approximate on-screen text of CommonMark/GFM prose, so a selection copied
 * from a rendered chat answer can be checked against the Markdown the worker
 * signed. Three stages, each protecting what the next must not touch:
 *
 * 1. Code-span bodies, then backslash-escaped punctuation, are swapped for
 *    private-use placeholders so `` `**x**` `` and `\*` survive as literal text.
 *    Every span gets its own scalar: a placeholder that stage 2 discards (a
 *    code span inside a link destination) must not shift the bodies that
 *    later spans restore, or the fold would contain text that was never shown.
 * 2. Links collapse to their text (the destination and title are parsed the
 *    CommonMark way, balanced parens and all, so no tail of a URL survives),
 *    heading / list / blockquote prefixes are dropped, then
 *    paired strong / emphasis / strikethrough delimiters are unwrapped until
 *    nothing changes (nesting such as `***x***`).
 * 3. Placeholders are restored.
 *
 * Approximate on purpose: images, reference links, raw HTML and fenced blocks
 * are not modelled. Only ever run this on the signed side; the reader's
 * selection is already visible text.
 */

const MD_ESCAPABLE = '\\`*_{}[]()#+-.!>~|'
const MD_ESCAPE_RE = new RegExp(`\\\\([${MD_ESCAPABLE.replace(/[\\\]^-]/g, '\\$&')}])`, 'g')
const ESCAPE_BASE = 0xe000
const ESCAPE_PLACEHOLDER_RE = new RegExp(
  `[\\u${ESCAPE_BASE.toString(16)}-\\u${(ESCAPE_BASE + MD_ESCAPABLE.length - 1).toString(16)}]`,
  'g',
)
const SPAN_BASE = 0xe100
const SPAN_PLACEHOLDER_RE = /[\uE100-\uF8FF]/g
/** The BMP private-use area (escape table + span table); input there would collide. */
const RESERVED_PUA_RE = /[\uE000-\uF8FF]/g

const MD_CODE_SPAN_RE = /`+([^`]+?)`+/g
const MD_BLOCK_PREFIX_RE = /^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+|\d{1,3}[.)][ \t]+)/gm
const MD_STRONG_RE = /(\*\*|__)(?=\S)([\s\S]*?\S)\1/g
const MD_STRIKE_RE = /~~(?=\S)([\s\S]*?\S)~~/g
const MD_EM_STAR_RE = /\*(?=\S)([^*]*?\S)\*/g
const MD_EM_UNDERSCORE_RE = /(?<![\p{L}\p{N}])_(?=\S)([^_]*?\S)_(?![\p{L}\p{N}])/gu

export function markdownToPlainText(markdown: string): string {
  const codeSpans: string[] = []
  let text = markdown
    .replace(RESERVED_PUA_RE, '')
    .replace(MD_CODE_SPAN_RE, (_, body: string) => {
      // One scalar per span; the 8KB answer cap keeps the count far below the range.
      codeSpans.push(body)
      return String.fromCharCode(SPAN_BASE + codeSpans.length - 1)
    })
    .replace(MD_ESCAPE_RE, (_, ch: string) => String.fromCharCode(ESCAPE_BASE + MD_ESCAPABLE.indexOf(ch)))

  text = stripLinks(text).replace(MD_BLOCK_PREFIX_RE, '')
  let previous: string
  do {
    previous = text
    text = text
      .replace(MD_STRONG_RE, '$2')
      .replace(MD_STRIKE_RE, '$1')
      .replace(MD_EM_STAR_RE, '$1')
      .replace(MD_EM_UNDERSCORE_RE, '$1')
  } while (text !== previous)

  return text
    .replace(SPAN_PLACEHOLDER_RE, (ch) => codeSpans[ch.charCodeAt(0) - SPAN_BASE] ?? '')
    .replace(ESCAPE_PLACEHOLDER_RE, (ch) => MD_ESCAPABLE[ch.charCodeAt(0) - ESCAPE_BASE]!)
}

/**
 * Replace every inline link `[text](destination "title")` with `text`. Any
 * `[text](` that is not followed by a well-formed destination is left as it
 * is, which is also how CommonMark renders it. Escapes and code spans are
 * already placeholders here, so `\)` cannot end a destination early.
 */
function stripLinks(text: string): string {
  let out = ''
  let from = 0
  for (;;) {
    const open = text.indexOf('](', from)
    if (open === -1) return out + text.slice(from)
    const start = text.lastIndexOf('[', open)
    const close = start >= from && !text.slice(start + 1, open).includes(']') ? linkEnd(text, open + 2) : -1
    if (close === -1) {
      out += text.slice(from, open + 2)
      from = open + 2
      continue
    }
    out += text.slice(from, start) + text.slice(start + 1, open)
    from = close + 1
  }
}

const TITLE_CLOSER: Record<string, string> = { '"': '"', "'": "'", '(': ')' }

/** Index of the `)` that ends a link whose destination starts at `pos`, or -1. */
function linkEnd(text: string, pos: number): number {
  let i = skipSpace(text, pos)
  if (text[i] === '<') {
    // CommonMark: a `<...>` destination may hold spaces but no line ending or `<`.
    const end = text.indexOf('>', i + 1)
    if (end === -1 || /[\n\r<]/.test(text.slice(i + 1, end))) return -1
    i = end + 1
  } else {
    let depth = 0
    for (; i < text.length; i++) {
      const ch = text[i]!
      if (/\s/.test(ch)) break
      if (ch === '(') depth++
      else if (ch === ')') {
        if (depth === 0) break
        depth--
      }
    }
    if (depth !== 0) return -1
  }
  i = skipSpace(text, i)
  const closer = TITLE_CLOSER[text[i] ?? '']
  if (closer) {
    i = text.indexOf(closer, i + 1)
    if (i === -1) return -1
    i = skipSpace(text, i + 1)
  }
  return text[i] === ')' ? i : -1
}

function skipSpace(text: string, pos: number): number {
  while (pos < text.length && /\s/.test(text[pos]!)) pos++
  return pos
}
