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
  "what_it_does": "2-3 sentences, max ~60 words, at roughly grade 7-8 reading level",
  "key_points": ["max 4 short bullets"],
  "terms_explained": [{ "term": "ACRONYM", "plain": "short plain definition" }]
}

Rules:
- Use only facts from the summary and metadata above. Do not invent context.
- Replace or define jargon and acronyms for a lay reader.
- Keep language neutral and concise.
- Keep "what_it_does" under 60 words so it fits on the card without truncation.`;
}
