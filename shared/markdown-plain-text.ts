/**
 * Approximate on-screen text of CommonMark/GFM prose, so a selection copied
 * from a rendered chat answer can be checked against the Markdown the worker
 * signed. Three stages, each protecting what the next must not touch:
 *
 * 1. Code-span bodies, then backslash-escaped punctuation, are swapped for
 *    private-use placeholders so `` `**x**` `` and `\*` survive as literal text.
 * 2. Link syntax and heading / list / blockquote prefixes are dropped, then
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
const CODE_PLACEHOLDER = '\uE0FF'
const CODE_PLACEHOLDER_RE = /\uE0FF/g
/** Private-use scalars this module hands out; any already present would collide. */
const RESERVED_PUA_RE = /[\uE000-\uE0FF]/g

const MD_CODE_SPAN_RE = /`+([^`]+?)`+/g
const MD_LINK_RE = /\[([^\]]*)\]\([^)]*\)/g
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
      codeSpans.push(body)
      return CODE_PLACEHOLDER
    })
    .replace(MD_ESCAPE_RE, (_, ch: string) => String.fromCharCode(ESCAPE_BASE + MD_ESCAPABLE.indexOf(ch)))

  text = text.replace(MD_LINK_RE, '$1').replace(MD_BLOCK_PREFIX_RE, '')
  let previous: string
  do {
    previous = text
    text = text
      .replace(MD_STRONG_RE, '$2')
      .replace(MD_STRIKE_RE, '$1')
      .replace(MD_EM_STAR_RE, '$1')
      .replace(MD_EM_UNDERSCORE_RE, '$1')
  } while (text !== previous)

  let nextSpan = 0
  return text
    .replace(CODE_PLACEHOLDER_RE, () => codeSpans[nextSpan++] ?? '')
    .replace(ESCAPE_PLACEHOLDER_RE, (ch) => MD_ESCAPABLE[ch.charCodeAt(0) - ESCAPE_BASE]!)
}
