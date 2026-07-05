import {
  FEED_BULLET_MAX_WORDS,
  FEED_COLLAPSED_MAX_BULLETS,
  FEED_LEAD_MAX_WORDS,
} from "../../../../shared/feed-content";

export function buildTitleOnlyDigestPrompt(params: {
  title: string;
  billLabel: string;
  policyArea: string | null;
}): string {
  return `You rewrite U.S. congressional floor items for everyday readers who do not know congressional jargon.

BILL: ${params.billLabel}
TITLE: ${params.title}
POLICY AREA: ${params.policyArea ?? "N/A"}

There is no official CRS summary for this item. Use only the bill title and metadata above.

Return ONLY valid JSON:
{
  "headline": "8-12 words, no jargon",
  "what_it_does": "Exactly one short sentence, max ${FEED_LEAD_MAX_WORDS} words, grade 7-8 reading level",
  "key_points": ["1-${FEED_COLLAPSED_MAX_BULLETS} bullets, max ${FEED_BULLET_MAX_WORDS} words each"],
  "terms_explained": [{ "term": "ACRONYM", "plain": "short plain definition" }]
}

Rules:
- Use only facts stated in the title and metadata. Do not invent policy details.
- If this is a procedural rules vote (for example "Providing for consideration"), explain the floor procedure in plain language.
- Replace or define jargon and acronyms for a lay reader.
- Keep language neutral and concise.
- "what_it_does" must be a single sentence ending with . ! or ? — never multiple sentences.
- Do not exceed the word limits above; overlong text will be cut off at ingest.`;
}

export function buildDigestPrompt(params: {
  title: string | null;
  billLabel: string;
  policyArea: string | null;
  rawSummary: string;
  acronyms: string[];
}): string {
  return `You rewrite U.S. congressional bill summaries for everyday readers who do not know congressional jargon.

BILL: ${params.billLabel}
TITLE: ${params.title ?? "N/A"}
POLICY AREA: ${params.policyArea ?? "N/A"}
ACRONYMS IN SOURCE: ${params.acronyms.join(", ") || "none"}

OFFICIAL CRS SUMMARY:
${params.rawSummary}

Return ONLY valid JSON:
{
  "headline": "8-12 words, no jargon",
  "what_it_does": "Exactly one short sentence, max ${FEED_LEAD_MAX_WORDS} words, grade 7-8 reading level",
  "key_points": ["2-${FEED_COLLAPSED_MAX_BULLETS} bullets, max ${FEED_BULLET_MAX_WORDS} words each, highlight the most important changes"],
  "terms_explained": [{ "term": "ACRONYM", "plain": "short plain definition" }]
}

Rules:
- Use only facts from the summary and metadata above. Do not invent context.
- Replace or define jargon and acronyms for a lay reader.
- Keep language neutral and concise.
- "what_it_does" must be a single sentence ending with . ! or ? — never multiple sentences.
- Put specifics, thresholds, agencies, and deadlines in "key_points", not in "what_it_does".
- Each "key_points" entry should be a scannable phrase, not a paragraph.
- Do not exceed the word limits above; overlong text will be cut off at ingest.`;
}
