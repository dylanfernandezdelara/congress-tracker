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

/** trumpstruth.org archive timestamps are US Eastern. */
const TRUMPTRUTH_EASTERN_OFFSET = "-04:00";
export const TRUMPTRUTH_FETCH_TIMEOUT_MS = 15_000;

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
  const postedAt = dateMatch
    ? parseTrumpTruthDate(dateMatch[0])
    : parseTrumpTruthDateFallback();

  return {
    id,
    text: text.trim(),
    postedAt,
    sourceUrl: `https://truthsocial.com/@realDonaldTrump/${id}`,
    archiveUrl,
  };
}

function parseTrumpTruthDateFallback(): string {
  console.warn(JSON.stringify({ event: "trumpstruth_date_missing" }));
  return new Date().toISOString();
}

export function parseTrumpTruthDate(raw: string): string {
  const normalized = raw.replace(/,/g, "").trim();
  const eastern = new Date(`${normalized} ${TRUMPTRUTH_EASTERN_OFFSET}`);
  if (Number.isNaN(eastern.getTime())) {
    console.warn(JSON.stringify({ event: "trumpstruth_date_parse_failed", raw }));
    return parseTrumpTruthDateFallback();
  }
  return eastern.toISOString();
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

async function fetchTrumpTruthHtml(url: string, fetchImpl: typeof fetch): Promise<string | null> {
  const response = await fetchImpl(url, {
    headers: { Accept: "text/html", "User-Agent": "congress-tracker/0.1" },
    signal: AbortSignal.timeout(TRUMPTRUTH_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  return response.text();
}

export async function fetchTrumpTruthRecentStatuses(
  limit: number,
  fetchImpl: typeof fetch = fetch
): Promise<ParsedTrumpTruthStatus[]> {
  const homeHtml = await fetchTrumpTruthHtml("https://www.trumpstruth.org/", fetchImpl);
  if (!homeHtml) {
    throw new Error("trumpstruth_home_fetch_failed");
  }
  const listings = parseTrumpTruthHomeListings(homeHtml).slice(0, limit);
  const statuses: ParsedTrumpTruthStatus[] = [];

  for (const listing of listings) {
    const pageHtml = await fetchTrumpTruthHtml(listing.archiveUrl, fetchImpl);
    if (!pageHtml) continue;
    const parsed = parseTrumpTruthStatusPage(pageHtml, listing.archiveUrl);
    if (parsed) statuses.push(parsed);
  }
  return statuses;
}
