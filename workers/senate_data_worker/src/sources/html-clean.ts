export function stripHtmlToText(html: string): string {
  let s = html ?? "";
  s = s.replace(/<\/(li|p|div|h\d)>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n  - ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n\s*\n+/g, "\n");
  return s.trim();
}

export function extractAcronyms(text: string): string[] {
  const matches = text.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+)?\b/g) ?? [];
  const allow = new Set(["US", "DC", "UK", "UN", "EU"]);
  return [...new Set(matches)].filter((m) => !allow.has(m));
}
