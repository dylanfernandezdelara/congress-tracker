import { fetchJson } from "./http";

const WIKIPEDIA_UA =
  "congress-tracker/0.1 (https://github.com/dylanfernandezdelara/congress-tracker; nomination bio lookup)";

interface WikipediaSearchResponse {
  query?: {
    search?: Array<{ title?: string; snippet?: string }>;
  };
}

interface WikipediaSummaryResponse {
  type?: string;
  title?: string;
  description?: string | null;
  extract?: string | null;
  content_urls?: {
    desktop?: { page?: string };
  };
}

export interface WikipediaPersonHit {
  url: string;
  title: string;
  extract: string;
}

function wikipediaHeaders(): HeadersInit {
  return {
    "User-Agent": WIKIPEDIA_UA,
    Accept: "application/json",
  };
}

function lastName(displayName: string): string | null {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[.,]/g, ""))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts[parts.length - 1] ?? null;
}

function nameLooksRelated(pageTitle: string, displayName: string): boolean {
  const surname = lastName(displayName);
  if (!surname || surname.length < 2) return false;
  return pageTitle.toLowerCase().includes(surname.toLowerCase());
}

function buildSearchQuery(params: {
  displayName: string;
  positionTitle: string | null;
  organization: string | null;
}): string {
  const bits = [`"${params.displayName.trim()}"`];
  if (params.positionTitle?.trim()) bits.push(params.positionTitle.trim());
  else if (params.organization?.trim()) bits.push(params.organization.trim());
  return bits.join(" ");
}

async function searchTitles(query: string, limit = 5): Promise<string[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(limit));
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const data = await fetchJson<WikipediaSearchResponse>(url.toString(), {
    headers: wikipediaHeaders(),
  });
  return (data.query?.search ?? [])
    .map((row) => row.title?.trim())
    .filter((title): title is string => Boolean(title));
}

async function fetchSummary(title: string): Promise<WikipediaSummaryResponse | null> {
  const encoded = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
  try {
    return await fetchJson<WikipediaSummaryResponse>(url, {
      headers: wikipediaHeaders(),
    });
  } catch {
    return null;
  }
}

function acceptSummary(
  summary: WikipediaSummaryResponse,
  displayName: string
): WikipediaPersonHit | null {
  if (summary.type !== "standard") return null;
  const title = summary.title?.trim();
  const extract = summary.extract?.trim();
  const pageUrl = summary.content_urls?.desktop?.page?.trim();
  if (!title || !extract || !pageUrl) return null;
  if (!nameLooksRelated(title, displayName)) return null;
  // Prefer people pages; description often looks like "American politician".
  const description = summary.description?.toLowerCase() ?? "";
  const extractLower = extract.toLowerCase();
  const personCue =
    /\b(politician|diplomat|judge|attorney|lawyer|governor|senator|representative|ambassador|secretary|admiral|general|professor|physician|business|executive|official|nominee|cabinet)\b/.test(
      `${description} ${extractLower}`
    ) || extractLower.includes(displayName.split(/\s+/).slice(-1)[0]?.toLowerCase() ?? "");
  if (!personCue) return null;
  return { url: pageUrl, title, extract };
}

/**
 * Best-effort Wikipedia person lookup for a Senate nominee.
 * Returns null when there is no confident match (never guess a wrong person).
 */
export async function lookupNomineeWikipedia(params: {
  displayName: string;
  positionTitle: string | null;
  organization: string | null;
}): Promise<WikipediaPersonHit | null> {
  const displayName = params.displayName.trim();
  if (!displayName) return null;

  const queries = [
    buildSearchQuery(params),
    `"${displayName}"`,
  ];
  const seen = new Set<string>();

  for (const query of queries) {
    let titles: string[] = [];
    try {
      titles = await searchTitles(query);
    } catch {
      continue;
    }
    for (const title of titles) {
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const summary = await fetchSummary(title);
      if (!summary) continue;
      const hit = acceptSummary(summary, displayName);
      if (hit) return hit;
    }
  }

  return null;
}

/** Truncate a Wikipedia extract to a short person blurb for the feed UI. */
export function truncateWikipediaExtract(extract: string, maxChars = 320): string {
  const collapsed = extract.replace(/\s+/g, " ").trim();
  if (!collapsed) return collapsed;
  if (collapsed.length <= maxChars) return collapsed;

  const window = collapsed.slice(0, maxChars);
  const markers = [". ", "! ", "? "];
  const sentenceAt = Math.max(...markers.map((m) => window.lastIndexOf(m)));
  if (sentenceAt >= Math.floor(maxChars * 0.45)) {
    return window.slice(0, sentenceAt + 1).trimEnd();
  }
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace <= 0) return `${window.trimEnd()}…`;
  return `${window.slice(0, lastSpace).trimEnd()}…`;
}

/** Fallback search URL when no confident article was stored. */
export function wikipediaSearchUrl(displayName: string): string {
  const q = displayName.trim();
  return `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`;
}
