/**
 * Automatic checks on a summary against its bill, run before a summary is stored. Nothing here judges quality; it
 * catches what a reader must never see: numbers the sources do not contain, judging words, and shapes the site
 * cannot show. `blocking` flags stop the summary from being stored; the rest are warnings kept for the evals.
 *
 * Import-free on purpose: scripts/digest-eval loads this file directly.
 */

export interface CheckableSummary {
  headline: string;
  what_it_does: string;
  who_it_affects?: string[];
  key_points: Array<{ text: string; section: string | null }>;
  inside?: Array<{ part: string; summary: string; section?: string | null }>;
}

export interface CheckableSources {
  type: string;
  title: string | null;
  crsText: string | null;
  /** Full text, or every part's text joined, or null when not published. */
  text: string | null;
  statusLabel: string;
}

export interface CheckResult {
  blocking: string[];
  warnings: string[];
  grade: number;
}

const JUDGING = [
  "landmark", "sweeping", "historic", "controversial", "common-sense", "commonsense", "radical", "extreme", "bold",
  "crucial", "critical", "harmful", "dangerous", "devastating", "unprecedented", "massive", "draconian", "reckless", "vital",
];

const SCALE: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

/** Every numeric value in a text: "$45,000,000,000", "$45 billion", "15 percent", "three years", "2028". */
export function numbersIn(text: string | null | undefined): Set<number> {
  const values = new Set<number>();
  const s = String(text ?? "");
  for (const m of s.matchAll(/\$?\s?(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion)?/gi)) {
    const n = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    values.add(m[2] ? Math.round(n * SCALE[m[2].toLowerCase()]!) : n);
  }
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(s)) values.add(n);
  }
  return values;
}

/** Section and law citations ("Sec. 70101", "title 31") are not facts to check. */
function withoutCitations(text: string): string {
  return text
    .replace(/\b(Secs?\.|Sections?|Title|Subtitle|Division|U\.S\.C\.|Public Law|P\.L\.)\s*[\dIVXLC]+[\w.–-]*/gi, " ")
    .replace(/\b(H\.\s?R\.|S\.|H\.\s?Res\.|H\.\s?J\.\s?Res\.|H\.\s?Con\.\s?Res\.)\s*\d+/gi, " ");
}

const words = (s: string | null | undefined): number => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  return Math.max(1, w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g)?.length ?? 1);
}

/** Flesch-Kincaid grade of the reader-facing text. */
export function gradeLevel(text: string): number {
  const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const ws = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (ws.length === 0) return 0;
  const syl = ws.reduce((n, w) => n + syllables(w), 0);
  return Math.round((0.39 * (ws.length / sentences) + 11.8 * (syl / ws.length) - 15.59) * 10) / 10;
}

/** "Sec. 2", "Secs. 70101, 70104", "Secs. 71119–71120" → section numbers (short ranges expanded). */
export function citedSections(section: string | null | undefined): string[] {
  const out: string[] = [];
  for (const m of String(section ?? "").matchAll(/(\d+[A-Z]?)(?:\s*[–-]\s*(\d+))?/g)) {
    const a = Number.parseInt(m[1]!, 10);
    const b = m[2] ? Number.parseInt(m[2], 10) : null;
    if (b && b > a && b - a <= 30) for (let n = a; n <= b; n += 1) out.push(String(n));
    else out.push(m[1]!);
  }
  return out;
}

/**
 * Text of the given sections: from "SEC. n." to the next section in sequence. Bills that amend other laws quote
 * whole new sections ("SEC. 117A.") inside their own; those headings do not end the cited section.
 */
export function sectionText(fullText: string | null, sections: string[]): string | null {
  if (!fullText) return null;
  const full = `\n${fullText}`;
  const found: string[] = [];
  for (const n of sections) {
    const start = full.search(new RegExp(`\\nSEC\\. ${n}\\.?\\s`));
    if (start < 0) continue;
    const num = Number.parseInt(n, 10);
    const after = full.slice(start + 1);
    let end = after.length;
    for (const m of after.matchAll(/\nSEC\. (\d+)\.?\s/g)) {
      const next = Number.parseInt(m[1]!, 10);
      if (next > num && next <= num + 5) {
        end = m.index ?? end;
        break;
      }
    }
    found.push(after.slice(0, end));
  }
  return found.length ? found.join("\n") : null;
}

export function readerText(summary: CheckableSummary): string {
  return [
    summary.headline,
    summary.what_it_does,
    ...summary.key_points.map((k) => k.text),
    ...(summary.inside ?? []).map((r) => r.summary),
  ]
    .filter(Boolean)
    .join(" ");
}

export function checkSummary(summary: CheckableSummary, sources: CheckableSources, options: { long?: boolean } = {}): CheckResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!summary.headline?.trim()) blocking.push("empty headline");
  if (!summary.what_it_does?.trim()) blocking.push("empty what_it_does");
  if (summary.key_points.length === 0) blocking.push("no key points");

  const hw = words(summary.headline);
  if (hw < 5 || hw > 13) warnings.push(`headline ${hw} words`);
  if (/^(this bill|new legislation|the bill)\b/i.test(summary.headline ?? "")) warnings.push("headline starts generic");
  if (words(summary.what_it_does) > 28) warnings.push(`what_it_does ${words(summary.what_it_does)} words`);
  // Long bills, and rules for debate (one point per measure they set up), may use five.
  const maxPoints = options.long || /^(HRES|SRES)$/i.test(sources.type) ? 5 : 4;
  if (summary.key_points.length > maxPoints) warnings.push(`${summary.key_points.length} key points`);
  for (const p of summary.key_points) if (words(p.text) > 24) warnings.push(`key point ${words(p.text)} words`);
  if ((summary.who_it_affects?.length ?? 0) > 3) warnings.push(`${summary.who_it_affects!.length} groups affected`);

  const text = readerText(summary);
  // Fixed terms of art are not judgments ("critical minerals", "critical-mineral", "critical access hospitals").
  const plain = text.toLowerCase().replace(/\bcritical[- ](minerals?|infrastructure|access|habitat|care)\b/g, "");
  for (const w of JUDGING) if (new RegExp(`\\b${w}\\b`).test(plain)) blocking.push(`judging word "${w}"`);

  const known = numbersIn([sources.title, sources.crsText, sources.text, sources.statusLabel].join("\n"));
  const crsNumbers = numbersIn([sources.title, sources.crsText].join("\n"));
  // Key points are checked against the sections they cite, which catches a wrong figure in a 500-page bill even
  // when the same number appears elsewhere in it. Uncited points, and everything else, use all sources.
  const uncited: string[] = [];
  for (const p of summary.key_points) {
    const cited = sectionText(sources.text, citedSections(p.section));
    if (!cited) {
      uncited.push(p.text);
      continue;
    }
    const local = numbersIn(cited);
    for (const n of numbersIn(withoutCitations(p.text))) {
      if (local.has(n) || crsNumbers.has(n) || n <= 12) continue;
      if (known.has(n)) warnings.push(`number not in cited section (${p.section}): ${n}`);
      else blocking.push(`number not in sources: ${n}`);
    }
  }
  const rest = [summary.headline, summary.what_it_does, ...uncited, ...(summary.inside ?? []).map((r) => r.summary)].join(" ");
  for (const n of numbersIn(withoutCitations(rest))) {
    if (known.has(n)) continue;
    // Small counts ("two groups", "3 years") are often paraphrased from words; larger unknown numbers are not.
    if (n > 12) blocking.push(`number not in sources: ${n}`);
  }
  return { blocking, warnings, grade: gradeLevel(text) };
}
