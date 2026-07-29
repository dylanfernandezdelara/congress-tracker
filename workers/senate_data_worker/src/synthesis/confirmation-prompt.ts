import {
  FEED_BULLET_MAX_WORDS,
  FEED_COLLAPSED_MAX_BULLETS,
  FEED_LEAD_MAX_WORDS,
} from "../../../../shared/feed-content";

export function buildConfirmationBackgroundPrompt(params: {
  citation: string;
  description: string | null;
  positionTitle: string | null;
  organization: string | null;
  rawBackground: string;
}): string {
  return `You rewrite U.S. Senate confirmation / nomination records for everyday readers.

NOMINATION: ${params.citation}
OFFICIAL DESCRIPTION: ${params.description ?? "N/A"}
POSITION: ${params.positionTitle ?? "N/A"}
ORGANIZATION: ${params.organization ?? "N/A"}

SOURCE TEXT:
${params.rawBackground}

Return ONLY valid JSON:
{
  "headline": "8-12 words naming the person and role when possible",
  "what_was_confirmed": "Exactly one short sentence, max ${FEED_LEAD_MAX_WORDS} words, stating what the Senate confirmed",
  "background": "1-2 short sentences, max ${FEED_LEAD_MAX_WORDS * 2} words total, on who the person is and the role/agency — grade 7-8 reading level",
  "key_points": ["up to ${FEED_COLLAPSED_MAX_BULLETS} bullets, max ${FEED_BULLET_MAX_WORDS} words each"]
}

Rules:
- Use only facts from the source text and metadata above. Do not invent biography, prior jobs, or politics.
- If the source is thin, keep "background" to what is known (name, state, office) and do not speculate.
- Keep language neutral and concise.
- "what_was_confirmed" must be a single sentence ending with . ! or ?
- Prefer the nominee's name in the headline when present.`;
}
