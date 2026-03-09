import { mapWithConcurrency } from "./concurrency";
import type { FetchConfig } from "./fetch";
import type {
  GovInfoCrecGranuleHighlightItem,
  MemberActivityContext,
  SenateRecordArticleItem,
  SessionOverview,
} from "./types";
import type {
  PartyArgumentSummary,
  VoteDetailResponse,
} from "./platform-types";
import type { SourceCacheEnv } from "./source-cache";
import { fetchSourceArtifactText } from "./source-cache";
import type {
  RecordDocumentWrite,
  VoteArgumentExcerptWrite,
  VoteEvidenceWrite,
} from "./d1";

interface EvidenceCandidate {
  documentId: string;
  sourceType: "congress_record" | "floor_log";
  source: string;
  title: string;
  url: string;
  date?: string;
  party?: string;
  metadata?: Record<string, unknown>;
}

const STOPWORDS = new Set([
  "adjournment",
  "the",
  "and",
  "article",
  "for",
  "that",
  "with",
  "from",
  "this",
  "have",
  "will",
  "into",
  "about",
  "after",
  "before",
  "under",
  "over",
  "senate",
  "congressional",
  "record",
  "volume",
  "number",
  "issue",
  "page",
  "pages",
  "gpo",
  "president",
  "officer",
  "clerk",
  "order",
  "orders",
  "calendar",
  "placed",
  "pledge",
  "allegiance",
  "morning",
  "business",
  "communication",
  "communications",
  "introduced",
  "today",
  "session",
  "vote",
  "voted",
  "bill",
  "measure",
  "motion",
  "floor",
  "act",
  "resolution",
  "nomination",
  "confirmation",
  "whether",
  "their",
  "there",
  "which",
  "while",
  "they",
  "them",
  "than",
  "when",
  "what",
  "where",
  "whose",
  "would",
  "could",
  "should",
  "into",
  "your",
  "been",
  "being",
  "because",
  "between",
  "through",
  "united",
  "states",
  "direct",
  "directing",
  "remove",
  "removal",
  "within",
  "against",
  "authorized",
  "authorization",
  "forces",
]);

const NOISE_TITLE_PATTERNS = [
  /pledge of allegiance/i,
  /measure placed on the calendar/i,
  /bills introduced/i,
  /messages from the house/i,
  /executive and other communications/i,
  /adjournment until/i,
  /order of procedure/i,
  /morning business/i,
  /submitted resolutions/i,
  /additional cosponsors/i,
  /prayer/i,
  /appointment/i,
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(text: string): string {
  const withBreaks = text
    .replace(/<\/(p|div|li|h1|h2|h3|h4|article|section|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  return normalizeWhitespace(decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " ")));
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function withGovInfoApiKey(url: string, apiKey: string | undefined): string {
  if (!apiKey || !/govinfo\.gov/i.test(url) || /[?&]api_key=/.test(url)) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}api_key=${encodeURIComponent(apiKey)}`;
}

function isNoiseTitle(title: string): boolean {
  return NOISE_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

function normalizeArtifactText(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/Congressional Record, Volume \d+ Issue \d+.*?(?=[A-Z][A-Z'\- ]{6,}|$)/gis, " ")
      .replace(/\[Congressional Record.*?\]/gis, " ")
      .replace(/\[Page [^\]]+\]/gis, " ")
      .replace(/From the Congressional Record Online through the Government Publishing Office.*?(?=[A-Z][A-Z'\- ]{6,}|$)/gis, " ")
  );
}

function dateDistanceDays(a: string | undefined, b: string): number {
  if (!a) return 999;
  const aMs = Date.parse(`${a}T00:00:00Z`);
  const bMs = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) return 999;
  return Math.abs(Math.round((aMs - bMs) / 86_400_000));
}

function extractKeywords(detail: VoteDetailResponse): string[] {
  const seeds = normalizeArtifactText([
    detail.vote.title,
    detail.vote.question,
    detail.vote.issue,
    detail.vote.bill?.title,
    detail.vote.bill?.summary,
    detail.vote.bill?.policy_area,
    detail.history.issue_title,
    detail.history.thread_key,
  ]
    .filter(Boolean)
    .join(" "));

  const billRefMatch = seeds.match(
    /\b(s\.?\s*j\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|s\.?\s*res\.?|s\.?|h\.?\s*j\.?\s*res\.?|h\.?\s*con\.?\s*res\.?|h\.?\s*res\.?|h\.?\s*r\.?)\s*(\d+)\b/gi
  ) ?? [];
  const billRefs = billRefMatch.map((entry) => entry.replace(/\s+/g, " ").replace(/\s*\.\s*/g, ".").trim());

  const tokens = seeds
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));

  return Array.from(new Set([...billRefs, ...tokens])).slice(0, 18);
}

function scoreText(text: string, keywords: string[]): number {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (keyword.includes(".")) {
      if (normalized.includes(keyword.toLowerCase())) score += 3;
      continue;
    }
    const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(normalized)) score += 1;
  }
  return score;
}

function splitIntoPassages(text: string): string[] {
  return text
    .split(/\n{2,}|(?<=[.?!])\s{2,}/)
    .map((segment) => normalizeWhitespace(segment))
    .filter((segment) => segment.length >= 60);
}

function hasStrongKeywordMatch(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  const matches = keywords.filter((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (keyword.includes(".")) return new RegExp(escaped, "i").test(normalized);
    return new RegExp(`\\b${escaped}\\b`, "i").test(normalized);
  });
  const billRefMatches = matches.filter((keyword) => keyword.includes("."));
  const lexicalMatches = matches.filter((keyword) => !keyword.includes("."));
  return billRefMatches.length > 0 || lexicalMatches.length >= 2;
}

function trimExcerpt(text: string, keywords: string[]): string {
  const sentences = text.split(/(?<=[.?!])\s+/).map((sentence) => normalizeWhitespace(sentence));
  const matchedIndex = sentences.findIndex((sentence) => hasStrongKeywordMatch(sentence, keywords));
  if (matchedIndex === -1) return text.slice(0, 420);
  return sentences.slice(Math.max(0, matchedIndex - 1), matchedIndex + 2).join(" ").slice(0, 420);
}

function chooseBestPassage(text: string, title: string, keywords: string[]): string | null {
  const passages = splitIntoPassages(text);
  let bestScore = isNoiseTitle(title) ? -1 : scoreText(title, keywords);
  let bestPassage: string | null = null;
  for (const passage of passages) {
    const score = scoreText(passage, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestPassage = passage;
    }
  }
  if (!bestPassage || bestScore < 4 || !hasStrongKeywordMatch(bestPassage, keywords)) {
    return null;
  }
  return trimExcerpt(bestPassage, keywords);
}

function passageTerms(passages: string[]): string[] {
  const counts = new Map<string, number>();
  for (const passage of passages) {
    const tokens = passage
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 5 && !STOPWORDS.has(token));
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([token]) => token);
}

function partyStanceFromBreakdown(detail: VoteDetailResponse, party: string): PartyArgumentSummary["stance"] {
  const breakdown = detail.party_breakdown.find((entry) => entry.party === party);
  if (!breakdown) return "mixed";
  if (breakdown.yea > breakdown.nay) return "support";
  if (breakdown.nay > breakdown.yea) return "oppose";
  return "mixed";
}

function detectGranuleParty(
  item: GovInfoCrecGranuleHighlightItem,
  overview: SessionOverview
): string | undefined {
  const partyById = new Map(overview.senators.map((senator) => [senator.bioguide_id, senator.party]));
  const parties = Array.from(
    new Set((item.member_bioguide_ids ?? []).map((id) => partyById.get(id)).filter((value): value is string => Boolean(value)))
  );
  return parties.length === 1 ? parties[0] : undefined;
}

function inferPartyFromText(text: string, overview: SessionOverview): string | undefined {
  const byLastName = new Map<string, string>();
  for (const senator of overview.senators) {
    const surname = senator.name.split(",")[0]?.trim().toUpperCase();
    if (surname) byLastName.set(surname, senator.party);
  }
  const speakerMatch = normalizeArtifactText(text).match(/\b(Mr|Ms|Mrs)\.\s+([A-Z][A-Z'\-]+)\b/);
  if (!speakerMatch) return undefined;
  return byLastName.get(speakerMatch[2].toUpperCase());
}

function buildGovInfoCandidates(
  context: MemberActivityContext,
  detail: VoteDetailResponse,
  overview: SessionOverview,
  keywords: string[]
): EvidenceCandidate[] {
  return (context.senate_granule_highlights ?? [])
    .filter(
      (item) =>
        Boolean(item.text_url) &&
        dateDistanceDays(item.date, detail.vote.vote_date) <= 2 &&
        !isNoiseTitle(item.title) &&
        scoreText(item.title, keywords) >= 2
    )
    .slice(0, 12)
    .map((item) => ({
      documentId: `govinfo:${item.package_id}:${item.granule_id}`,
      sourceType: "congress_record" as const,
      source: "govinfo",
      title: item.title,
      url: item.text_url as string,
      date: item.date,
      party: detectGranuleParty(item, overview),
      metadata: {
        package_id: item.package_id,
        granule_id: item.granule_id,
        granule_class: item.granule_class,
        sub_granule_class: item.sub_granule_class,
      },
    }))
    .sort((a, b) => dateDistanceDays(a.date, detail.vote.vote_date) - dateDistanceDays(b.date, detail.vote.vote_date));
}

function buildCongressRecordCandidates(
  context: MemberActivityContext,
  detail: VoteDetailResponse,
  keywords: string[]
): EvidenceCandidate[] {
  return (context.senate_record_articles ?? [])
    .filter(
      (item) =>
        Boolean(item.formatted_text_url) &&
        dateDistanceDays(item.issue_date, detail.vote.vote_date) <= 2 &&
        !isNoiseTitle(item.title) &&
        scoreText(item.title, keywords) >= 2
    )
    .slice(0, 10)
    .map((item: SenateRecordArticleItem) => ({
      documentId: `congress-record:${item.issue_date}:${slugify(item.title)}`,
      sourceType: "congress_record" as const,
      source: "congress",
      title: item.title,
      url: item.formatted_text_url as string,
      date: item.issue_date,
      metadata: {
        issue_date: item.issue_date,
        section_name: item.section_name,
        start_page: item.start_page,
        end_page: item.end_page,
      },
    }))
    .sort((a, b) => dateDistanceDays(a.date, detail.vote.vote_date) - dateDistanceDays(b.date, detail.vote.vote_date));
}

function buildDigestCandidates(
  context: MemberActivityContext,
  detail: VoteDetailResponse,
  keywords: string[]
): EvidenceCandidate[] {
  return (context.daily_digest ?? [])
    .filter(
      (item) =>
        Boolean(item.senate_section_url ?? item.url) &&
        dateDistanceDays(item.date, detail.vote.vote_date) <= 2 &&
        !isNoiseTitle(item.title) &&
        scoreText(item.title, keywords) >= 2
    )
    .map((item) => ({
      documentId: `daily-digest:${item.date}`,
      sourceType: "congress_record" as const,
      source: "govinfo",
      title: item.title,
      url: (item.senate_section_url ?? item.url) as string,
      date: item.date,
      metadata: {
        summary: item.summary,
      },
    }));
}

async function fetchFloorLogCandidates(
  env: SourceCacheEnv,
  voteDate: string,
  fetchConfig: FetchConfig
): Promise<EvidenceCandidate[]> {
  const indexResult = await fetchSourceArtifactText(
    env,
    {
      source: "floor_log_index",
      entityKey: `floor-logs-${voteDate}`,
      requestUrl: "https://www.periodicalpress.senate.gov/category/floor-logs/",
      extension: "html",
      fetchedAt: `${voteDate}T00:00:00Z`,
    },
    fetchConfig
  );
  if (!indexResult.text) return [];

  const urls = Array.from(
    new Map(
      [...indexResult.text.matchAll(/https:\/\/www\.periodicalpress\.senate\.gov\/(\d{4})\/(\d{2})\/(\d{2})\/[^"'\s<]+/g)].map(
        (match) => [
          match[0],
          {
            url: match[0],
            date: `${match[1]}-${match[2]}-${match[3]}`,
          },
        ]
      )
    ).values()
  );

  return urls
    .filter((entry) => dateDistanceDays(entry.date, voteDate) <= 2)
    .slice(0, 4)
    .map((entry) => ({
      documentId: `floor-log:${entry.date}:${slugify(entry.url)}`,
      sourceType: "floor_log" as const,
      source: "floor_log",
      title: `Senate floor log for ${entry.date}`,
      url: entry.url,
      date: entry.date,
    }));
}

async function extractCandidateEvidence(
  env: SourceCacheEnv,
  candidate: EvidenceCandidate,
  detail: VoteDetailResponse,
  overview: SessionOverview,
  keywords: string[],
  fetchConfig: FetchConfig
): Promise<{
  document: RecordDocumentWrite;
  excerpt?: VoteArgumentExcerptWrite;
}> {
  const artifact = await fetchSourceArtifactText(
    env,
    {
      source: candidate.source,
      entityKey: candidate.documentId,
      requestUrl:
        candidate.source === "govinfo"
          ? withGovInfoApiKey(candidate.url, env.GOVINFO_API_KEY)
          : candidate.url,
      extension: candidate.sourceType === "floor_log" ? "html" : undefined,
      fetchedAt: candidate.date ? `${candidate.date}T00:00:00Z` : undefined,
      metadata: candidate.metadata,
    },
    fetchConfig
  );

  const document: RecordDocumentWrite = {
    documentId: candidate.documentId,
    source: candidate.source,
    title: candidate.title,
    documentDate: candidate.date,
    url: candidate.url,
    threadKey: detail.history.thread_key,
    metadata: {
      ...candidate.metadata,
      artifact_key: artifact.artifactKey,
      source_type: candidate.sourceType,
    },
  };

  if (!artifact.text) {
    return { document };
  }

  const normalizedText = artifact.contentType?.includes("html") || candidate.url.endsWith(".html")
    ? normalizeArtifactText(stripHtml(artifact.text))
    : normalizeArtifactText(artifact.text);
  const passage = chooseBestPassage(normalizedText, candidate.title, keywords);
  if (!passage) {
    return { document };
  }

  return {
    document,
    excerpt: {
      id: `${candidate.documentId}:excerpt-1`,
      party: candidate.party ?? inferPartyFromText(passage, overview),
      sourceDocumentId: candidate.documentId,
      source_type: candidate.sourceType,
      source_label: candidate.title,
      source_url: candidate.url,
      quote: passage,
      note: `Matched to ${detail.vote.title} using vote-title and issue keywords.`,
      date: candidate.date,
    },
  };
}

function buildPartySummaries(
  detail: VoteDetailResponse,
  excerpts: VoteArgumentExcerptWrite[]
): PartyArgumentSummary[] {
  return detail.party_breakdown.map((partyBreakdown) => {
    const partyExcerpts = excerpts.filter((excerpt) => excerpt.party === partyBreakdown.party);
    if (partyExcerpts.length === 0) {
      return {
        party: partyBreakdown.party,
        stance: partyStanceFromBreakdown(detail, partyBreakdown.party),
        summary:
          "Insufficient sourced evidence in the current official-record window to summarize a party-specific rationale.",
        confidence: "low",
        evidence_points: [],
        excerpt_ids: [],
        coverage_note: "No linked official excerpts were captured for this party in the current evidence window.",
      };
    }

    const terms = passageTerms(
      partyExcerpts.map((excerpt) => `${excerpt.quote ?? ""} ${excerpt.note ?? ""}`)
    );
    const topicPhrase = terms.length > 0 ? terms.join(", ") : "the linked floor arguments";
    return {
      party: partyBreakdown.party,
      stance: partyStanceFromBreakdown(detail, partyBreakdown.party),
      summary: `Official ${partyBreakdown.party}-linked excerpts in the current record window focus on ${topicPhrase}.`,
      confidence: partyExcerpts.length >= 2 ? "medium" : "low",
      evidence_points: partyExcerpts
        .slice(0, 2)
        .map((excerpt) => `${excerpt.source_label}${excerpt.date ? ` (${excerpt.date})` : ""}`),
      excerpt_ids: partyExcerpts.map((excerpt) => excerpt.id),
    };
  });
}

export async function extractVoteEvidence(
  env: SourceCacheEnv,
  detail: VoteDetailResponse,
  overview: SessionOverview,
  context: MemberActivityContext | null,
  fetchConfig: FetchConfig = {}
): Promise<VoteEvidenceWrite> {
  const effectiveContext: MemberActivityContext = context ?? {
    floor_schedule: [],
    committee_meetings: [],
    daily_digest: [],
  };
  const keywords = extractKeywords(detail);
  const candidates = [
    ...buildGovInfoCandidates(effectiveContext, detail, overview, keywords),
    ...buildCongressRecordCandidates(effectiveContext, detail, keywords),
    ...buildDigestCandidates(effectiveContext, detail, keywords),
    ...(await fetchFloorLogCandidates(env, detail.vote.vote_date, fetchConfig)),
  ]
    .sort((a, b) => {
      const byDate = dateDistanceDays(a.date, detail.vote.vote_date) - dateDistanceDays(b.date, detail.vote.vote_date);
      if (byDate !== 0) return byDate;
      return scoreText(b.title, keywords) - scoreText(a.title, keywords);
    })
    .slice(0, 10);

  const extracted = await mapWithConcurrency(candidates, 2, async (candidate) =>
    extractCandidateEvidence(env, candidate, detail, overview, keywords, fetchConfig)
  );

  const documents = extracted.map((item) => item.document);
  const excerpts = extracted
    .map((item) => item.excerpt)
    .filter((item): item is VoteArgumentExcerptWrite => Boolean(item));
  const parties = buildPartySummaries(detail, excerpts);

  return {
    documents,
    excerpts,
    parties,
  };
}
