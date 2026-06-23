import {
  DIGEST_BULLET_MAX_WORDS,
  DIGEST_LEAD_MAX_WORDS,
  DIGEST_MAX_BULLETS,
} from "../../../../shared/feed-content";

export function buildDigestPrompt(params: {
  title: string | null;
  billLabel: string;
  policyArea: string | null;
  rawSummary: string;
  acronyms: string[];
}): string {
  const leadTargetWords = Math.min(25, DIGEST_LEAD_MAX_WORDS);
  const bulletTargetWords = Math.min(12, DIGEST_BULLET_MAX_WORDS);
  const bulletCount = Math.min(4, DIGEST_MAX_BULLETS);

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
  "what_it_does": "Exactly one short sentence, max ${leadTargetWords} words, grade 7-8 reading level",
  "key_points": ["2-${bulletCount} bullets, max ${bulletTargetWords} words each, highlight the most important changes"],
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
