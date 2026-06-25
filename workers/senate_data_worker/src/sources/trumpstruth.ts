export interface ParsedTrumpTruthStatus {
  id: string;
  text: string;
  postedAt: string;
  sourceUrl: string;
  archiveUrl: string;
}

const TRUTH_SOCIAL_ID = /truthsocial\.com\/@realDonaldTrump\/(\d+)/i;
const OG_DESCRIPTION = /property="og:description"\s+content="([^"]+)"/i;
const POSTED_AT =
  /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4},\s+\d{1,2}:\d{2}\s+[AP]M/i;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x2019;/g, "'")
    .replace(/&#x201C;/g, '"')
    .replace(/&#x201D;/g, '"')
    .replace(/&#x21;/g, "!")
    .replace(/&#x20;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseTrumpTruthStatusPage(html: string, archiveUrl: string): ParsedTrumpTruthStatus | null {
  const idMatch = html.match(TRUTH_SOCIAL_ID);
  if (!idMatch) return null;
  const id = idMatch[1]!;

  const descMatch = html.match(OG_DESCRIPTION);
  const text = descMatch ? decodeHtmlEntities(descMatch[1]!) : "";
  if (!text.trim()) return null;

  const dateMatch = html.match(POSTED_AT);
  const postedAt = dateMatch ? parseTrumpTruthDate(dateMatch[0]) : new Date().toISOString();

  return {
    id,
    text: text.trim(),
    postedAt,
    sourceUrl: `https://truthsocial.com/@realDonaldTrump/${id}`,
    archiveUrl,
  };
}

export function parseTrumpTruthDate(raw: string): string {
  const parsed = new Date(raw.replace(",", ""));
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

export interface TrumpTruthListing {
  archiveUrl: string;
  postedAtLabel: string | null;
  snippet: string | null;
}

export function parseTrumpTruthHomeListings(html: string): TrumpTruthListing[] {
  const listings: TrumpTruthListing[] = [];
  const blockPattern =
    /data-status-url="(https:\/\/www\.trumpstruth\.org\/statuses\/\d+)"/gi;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html)) !== null) {
    const archiveUrl = match[1]!.trim();
    const slice = html.slice(match.index, match.index + 2500);
    const dateMatch = slice.match(POSTED_AT);
    const snippetMatch = slice.match(/class="snippet-content">([\s\S]*?)<\/div>/i);
    listings.push({
      archiveUrl,
      postedAtLabel: dateMatch?.[0] ?? null,
      snippet: snippetMatch ? stripTags(snippetMatch[1]!) : null,
    });
  }
  const seen = new Set<string>();
  return listings.filter((item) => {
    if (seen.has(item.archiveUrl)) return false;
    seen.add(item.archiveUrl);
    return true;
  });
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export async function fetchTrumpTruthRecentStatuses(
  limit: number,
  fetchImpl: typeof fetch = fetch
): Promise<ParsedTrumpTruthStatus[]> {
  const homeRes = await fetchImpl("https://www.trumpstruth.org/", {
    headers: { Accept: "text/html", "User-Agent": "congress-tracker/0.1" },
  });
  if (!homeRes.ok) {
    throw new Error(`trumpstruth_home_${homeRes.status}`);
  }
  const homeHtml = await homeRes.text();
  const listings = parseTrumpTruthHomeListings(homeHtml).slice(0, limit);
  const statuses: ParsedTrumpTruthStatus[] = [];

  for (const listing of listings) {
    const pageRes = await fetchImpl(listing.archiveUrl, {
      headers: { Accept: "text/html", "User-Agent": "congress-tracker/0.1" },
    });
    if (!pageRes.ok) continue;
    const pageHtml = await pageRes.text();
    const parsed = parseTrumpTruthStatusPage(pageHtml, listing.archiveUrl);
    if (parsed) statuses.push(parsed);
  }
  return statuses;
}
