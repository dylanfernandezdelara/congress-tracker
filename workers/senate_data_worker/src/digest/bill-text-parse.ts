/**
 * Bill XML (Congress.gov "Formatted XML") → text a model can read, and the split of long bills into their own
 * parts. Import-free on purpose: the digest regression suite (scripts/digest-eval) loads this file directly.
 */

/** Bills longer than this (≈ tokens) are summarized per part, then combined. */
export const SINGLE_PASS_MAX_TOKENS = 30_000;
/** A part larger than this is split again by subtitle. */
export const PART_MAX_TOKENS = 45_000;

export const approxTokens = (text: string): number => Math.ceil(text.length / 4);

export interface BillTextPart {
  label: string;
  text: string;
  tokens: number;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[e.toLowerCase()] ?? whole;
  });
}

/**
 * Bill XML → readable text that keeps section numbers ("SEC. 2. HEADER") on their own lines and quoted text quoted.
 * A defined term (`The term <term>critical material</term> means`) is quoted too, which the checks read as the bill's
 * own term. A resolution's preamble (its "Whereas …" clauses, rarely a bill's) comes first under a PREAMBLE line,
 * one clause per line, so the writer can tell the sponsor's framing from what the measure does; no line in it can
 * read as a "SEC. n." heading.
 */
export function billXmlToText(xml: string): string {
  return decode(
    xml
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<preamble\b[^>]*>/g, "\n\nPREAMBLE\n")
      .replace(/<\/preamble>/g, "\n\nEND OF PREAMBLE\n\n")
      .replace(/<(quote|term)\b[^>]*>/g, "“")
      .replace(/<\/(quote|term)>/g, "”")
      .replace(/<section\b[^>]*>\s*<enum>([^<]*)<\/enum>\s*<header>([\s\S]*?)<\/header>/g, "\n\nSEC. $1 $2\n")
      .replace(
        /<(subtitle|title|division|part|chapter)\b[^>]*>\s*<enum>([^<]*)<\/enum>\s*<header>([\s\S]*?)<\/header>/g,
        (_m, tag: string, e: string, h: string) => `\n\n${tag.toUpperCase()} ${e} — ${h}\n`
      )
      .replace(/<\/?(subsection|paragraph|subparagraph|clause|quoted-block|p|text|whereas)\b[^>]*>/g, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The bill's own body (legislation or resolution), without the front matter. A preamble before the body is kept:
 * a resolution's "Whereas" clauses carry its dates and figures (H.Res. 1585's "September 26, 2026").
 */
export function billBodyXml(xml: string): string {
  const start = xml.search(/<(preamble|legis-body|resolution-body)\b/);
  return start >= 0 ? xml.slice(start) : xml;
}

/** Top-level `tag` elements inside `body`, tracking nesting depth. */
function topLevel(body: string, tag: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  let depth = 0;
  let start = -1;
  for (const m of body.matchAll(re)) {
    if (m[1] !== "/") {
      if (depth === 0) start = m.index ?? 0;
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) out.push({ start, end: (m.index ?? 0) + m[0].length });
    }
  }
  return out;
}

function heading(xml: string): { enumText: string; header: string } | null {
  const m = /^<[^>]+>\s*<enum>([^<]*)<\/enum>\s*<header>([\s\S]*?)<\/header>/.exec(xml);
  if (!m) return null;
  return { enumText: decode(m[1]!).trim(), header: decode(m[2]!.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() };
}

/**
 * Split a long bill along its own structure: divisions, else titles; a part still too large is split again by
 * subtitle. Sections before the first part become "General provisions". Returns [] when the bill has no such
 * structure (then it is summarized in one pass, truncated if it must be).
 */
export function splitBillParts(bodyXml: string): BillTextPart[] {
  for (const tag of ["division", "title"]) {
    const spans = topLevel(bodyXml, tag);
    if (spans.length < 2) continue;
    const parts: Array<{ label: string; text: string }> = [];
    const lead = billXmlToText(bodyXml.slice(0, spans[0]!.start));
    if (lead.length > 200) parts.push({ label: "General provisions", text: lead });
    for (const span of spans) {
      const xml = bodyXml.slice(span.start, span.end);
      const h = heading(xml);
      const name = `${tag[0]!.toUpperCase()}${tag.slice(1)}`;
      const label = h ? `${name} ${h.enumText} — ${h.header}` : name;
      const text = billXmlToText(xml);
      if (approxTokens(text) > PART_MAX_TOKENS) {
        const subs = topLevel(xml.slice(1), "subtitle").map((s) => ({ start: s.start + 1, end: s.end + 1 }));
        if (subs.length >= 2) {
          for (const sub of subs) {
            const subXml = xml.slice(sub.start, sub.end);
            const sh = heading(subXml);
            parts.push({ label: `${label} / Subtitle ${sh?.enumText ?? ""} — ${sh?.header ?? ""}`, text: billXmlToText(subXml) });
          }
          continue;
        }
      }
      parts.push({ label, text });
    }
    return parts.map((p) => ({ ...p, tokens: approxTokens(p.text) }));
  }
  return [];
}
