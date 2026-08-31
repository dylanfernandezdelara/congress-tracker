/**
 * Senate LIS vote questions nest bill/amendment ids in XML placeholders, e.g.
 * `On the Motion to Table <measure>S.Amdt. 6747</measure>`. Keep the inner text.
 */
export function cleanVoteQuestion(raw: string | null | undefined): string {
  let text = (raw ?? "").replace(/<\/?[A-Za-z][A-Za-z0-9:_-]*\b[^>]*>/g, "")
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
  if (/<[A-Za-z/]/.test(text)) {
    text = text.replace(/<\/?[A-Za-z][A-Za-z0-9:_-]*\b[^>]*>/g, "")
  }
  return text.replace(/\s+/g, " ").trim()
}
