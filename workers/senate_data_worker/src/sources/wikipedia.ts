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

function nameTokens(displayName: string): string[] {
  return displayName
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[.,()'"]/g, ""))
    .filter((p) => p.length >= 2);
}

function titleMatchesPersonName(pageTitle: string, displayName: string): boolean {
  const tokens = nameTokens(displayName);
  if (tokens.length === 0) return false;
  const title = pageTitle.toLowerCase();
  const surname = lastName(displayName);
  if (!surname || !title.includes(surname.toLowerCase())) return false;
  // Require first name (or first initial match) when available — surname alone is not enough.
  if (tokens.length === 1) return true;
  const given = tokens[0]!.toLowerCase();
  if (title.includes(given)) return true;
  // Allow "J. Doe" style titles for "Jane Doe".
  if (given.length > 0 && title.includes(`${given[0]}.`)) return true;
  return false;
}

const PERSON_ROLE_CUE =
  /\b(politician|diplomat|judge|attorney|lawyer|governor|senator|representative|ambassador|secretary|admiral|general|professor|physician|business(?:person|man|woman)?|executive|official|nominee|cabinet|jurist|prosecutor|administrator)\b/i;

const TITLE_PERSON_DISAMBIG =
  /\((politician|judge|diplomat|lawyer|attorney|admiral|general|ambassador|official|business|academic)s?\)/i;

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

export function acceptWikipediaSummary(
  summary: WikipediaSummaryResponse,
  displayName: string
): WikipediaPersonHit | null {
  if (summary.type !== "standard") return null;
  const title = summary.title?.trim();
  const extract = summary.extract?.trim();
  const pageUrl = summary.content_urls?.desktop?.page?.trim();
  if (!title || !extract || !pageUrl) return null;
  if (!titleMatchesPersonName(title, displayName)) return null;
  const description = summary.description ?? "";
  const personCue =
    PERSON_ROLE_CUE.test(`${description} ${extract}`) ||
    TITLE_PERSON_DISAMBIG.test(title);
  if (!personCue) return null;
  return { url: pageUrl, title, extract };
}

export type WikipediaLookupResult =
  | { status: "hit"; hit: WikipediaPersonHit }
  | { status: "miss" }
  | { status: "unavailable"; error: string };

/**
 * Best-effort Wikipedia person lookup for a Senate nominee.
 * - hit: confident person page
 * - miss: searched successfully, no confident match (safe to seal)
 * - unavailable: transport/API failure (do not seal; retry next run)
 */
export async function lookupNomineeWikipedia(params: {
  displayName: string;
  positionTitle: string | null;
  organization: string | null;
}): Promise<WikipediaLookupResult> {
  const displayName = params.displayName.trim();
  if (!displayName) return { status: "miss" };

  const queries = [
    buildSearchQuery(params),
    `"${displayName}"`,
  ];
  const seen = new Set<string>();
  let sawSuccessfulSearch = false;
  let lastError: string | null = null;

  for (const query of queries) {
    let titles: string[] = [];
    try {
      titles = await searchTitles(query);
      sawSuccessfulSearch = true;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    for (const title of titles) {
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const summary = await fetchSummary(title);
      if (!summary) continue;
      const hit = acceptWikipediaSummary(summary, displayName);
      if (hit) return { status: "hit", hit };
    }
  }

  if (!sawSuccessfulSearch) {
    return {
      status: "unavailable",
      error: lastError ?? "Wikipedia search unavailable",
    };
  }
  return { status: "miss" };
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
