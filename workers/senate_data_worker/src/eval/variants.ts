import { OUTPUT, RULES, type PromptParts } from "../digest/prompt";

/*
 * Prompt versions an eval round can try (EvalCandidate.prompt). Production writes with prompt.ts's defaults; a
 * version here reaches the site only after it wins on held-out bills and its wording moves into prompt.ts.
 *
 * Every version returns the same JSON, so the worker's parser and checks apply unchanged; extra fields a version
 * asks for (a plan, a list of facts) are thinking space the parser ignores.
 */

/** Reader feedback from round 8 (Dylan's picks): outcome-first titles, the how and the when, fewer points. */
const READER_FOCUS = `READER FOCUS (most important; the rules below still apply)
- The headline states the outcome for people: what becomes possible, required, funded, or banned, and for whom. Use concrete nouns. Never vague words such as "places", "measures", "efforts", "entities", or "certain programs".
  Good: "Grants would help states hire more school nurses"
  Bad: "Bill would expand school health efforts" (no outcome, no mechanism)
- Say how it works: the mechanism that makes the outcome happen (a grant, a tax credit, a ban and its penalty, a new right to sue, a reporting rule) and the conditions under which it applies ("only after a judge finds…", "for companies with over 50 workers"). A reader should never have to wonder "why would that happen?" or "when does this apply?".
- Lead with the bill's main subject. If most of the bill is about one thing, name that thing in the headline or "what it does", not only in the last key point.
- Fewer, fuller points: each key point must add something the headline and "what it does" have not already said. Drop a point rather than repeat one.
- Plain English first: when a sentence needs a legal term, give its plain meaning instead, or explain it in the same sentence.`;

const V4_RULES = `${READER_FOCUS}\n\n${RULES}`;
const V4_OUTPUT = OUTPUT.replace(
  "- 2–4 key_points (at most 5 for very long bills).",
  "- 2–3 key_points (at most 4 when the bill makes that many separate changes that matter to people)."
);
if (V4_OUTPUT === OUTPUT) throw new Error("variants.ts: OUTPUT changed; update the key_points line");

/** Answer a reader's questions first, then write: a plan field ahead of the summary, which the parser ignores. */
const PLAN_OUTPUT = V4_OUTPUT.replace(
  'Return ONLY this JSON:\n{\n',
  `Return ONLY this JSON. Fill "reader_questions" first, from the SOURCES, then write the summary from those answers:
{
  "reader_questions": {
    "main_subject": "what most of the bill is about, in 3–8 words",
    "outcome": "what changes for people if it takes effect, and for whom",
    "how": "the mechanism: grant, credit, ban, requirement, right to sue, study…",
    "when_it_applies": "conditions, thresholds, dates, or null",
    "kind_of_measure": "law change, resolution that only states a view, rule for debate, constitutional amendment…"
  },
`
);

/** List the facts first, each tied to its section, then write only from them. */
const FACTS_OUTPUT = V4_OUTPUT.replace(
  'Return ONLY this JSON:\n{\n',
  `Return ONLY this JSON. Fill "facts" first: the 3–6 facts from the SOURCES that matter most to an everyday reader, each with its section, in your own plain words but changing no number, date, or strength of language. Then write the summary using only those facts:
{
  "facts": [{ "fact": "one fact", "section": "Sec. 2" }],
`
);

if (PLAN_OUTPUT === V4_OUTPUT || FACTS_OUTPUT === V4_OUTPUT) throw new Error("variants.ts: OUTPUT's opening changed");

export const PROMPT_VARIANTS: Record<string, PromptParts> = {
  "v3.4": {},
  v4: { rules: V4_RULES, output: V4_OUTPUT },
  "v4-plan": { rules: V4_RULES, output: PLAN_OUTPUT },
  "v4-facts": { rules: V4_RULES, output: FACTS_OUTPUT },
};

export function promptParts(name: string | undefined): PromptParts {
  if (!name) return {};
  const parts = PROMPT_VARIANTS[name];
  if (!parts) throw new Error(`unknown prompt version: ${name}`);
  return parts;
}
