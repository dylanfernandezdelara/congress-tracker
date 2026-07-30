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
  "headline": "8-12 words naming the person and the role (e.g. Jane Doe confirmed as Energy Secretary)",
  "what_was_confirmed": "Exactly one short sentence, max ${FEED_LEAD_MAX_WORDS} words, stating what the Senate confirmed",
  "background": "1-2 short sentences, max ${FEED_LEAD_MAX_WORDS * 2} words, about who the person is — prior work, expertise, or public background. Do NOT restate the confirmation or the headline.",
  "key_points": ["up to ${FEED_COLLAPSED_MAX_BULLETS} bullets only if they add facts beyond the headline/background; otherwise []"]
}

Rules:
- Use only facts from the source text and metadata above. Do not invent biography, prior jobs, or politics.
- Prefer Biography / intro lines in the source for "background". If those are missing, keep background to name, state, and the office — still without repeating "confirmed as…".
- "background" must not mirror the headline. Bad: "Jane Doe was nominated to lead the Department of Energy." Good: "Jane Doe is an energy policy expert from California who previously led state clean-energy programs."
- Never mention PN numbers, nomination citations, or roll-call numbers in any field.
- Keep language neutral and concise (grade 7-8).
- "what_was_confirmed" must be a single sentence ending with . ! or ?
- Prefer the nominee's name in the headline when present.`;
}
