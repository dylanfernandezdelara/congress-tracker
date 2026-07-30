import {
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
  "background": "1-2 short sentences, max ${FEED_LEAD_MAX_WORDS * 2} words, grounded in OFFICIAL nomination fields (name, state, office, agency, intro text). This is the primary About blurb.",
  "key_points": ["up to ${FEED_COLLAPSED_MAX_BULLETS} bullets only if they add facts beyond the headline/background; otherwise []"]
}

Rules:
- Official-first hybrid: "background" must be grounded in Congress.gov nomination metadata (description, position, organization, nominee name/state, intro text).
- A "Biography:" line in the source (encyclopedia extract) is supplemental only — do not copy it wholesale into "background". At most echo one clearly overlapping official fact.
- Use only facts from the source text and metadata above. Do not invent biography, prior jobs, education, or politics.
- If official facts are thin, write a plain identity line (name, state, office/agency) without padding. Example: "Jane Doe of California was confirmed as Secretary of Energy at the Department of Energy."
- "background" must not merely restate the headline with different words when richer official facts exist, but thin official text is preferred over invented color.
- Never mention PN numbers, nomination citations, roll-call numbers, or Wikipedia in any field.
- Keep language neutral and concise (grade 7-8).
- "what_was_confirmed" must be a single sentence ending with . ! or ?
- Prefer the nominee's name in the headline when present.`;
}
