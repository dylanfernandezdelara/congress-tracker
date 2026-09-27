/**
 * Plain-language bill summary prompt (v3, as tested in the round-2 eval): one pass for bills that fit, two passes
 * (per part, then combine) for long bills split along their own structure. Every prompt returns JSON only.
 *
 * The reader is an everyday person deciding whether they would support a bill, and whether their members of
 * Congress voted the way they would. So the summary leads with concrete effects on people's money, rights,
 * services and obligations, names who is affected, and stays strictly neutral.
 *
 * Layout is the tested one: the bill's details and sources first, the rules and output format after. Moving the
 * rules first would allow prompt caching, but at ~5 Sonnet rewrites a day most calls would miss a 5-minute cache and
 * pay the 1.25x cache-write price, so it would cost more, not less. Revisit if Sonnet volume grows ~10x.
 *
 * Import-free on purpose: scripts/digest-eval loads this file directly, so production and the evals share one prompt.
 */

export const PROMPT_VERSION = "v3.2";
/**
 * Part of every summary's fingerprint. Bump it only when existing summaries should be rewritten (a rewrite of the
 * whole site costs a few dollars); minor prompt versions apply to new writes and are recorded in `generator`.
 */
export const PROMPT_EPOCH = "v3";

export interface DigestVote {
  chamber: string;
  vote_date: string | null;
  question: string | null;
  result: string;
  yeas: number;
  nays: number;
}

export interface DigestBillInput {
  congress: number;
  type: string;
  number: number;
  title: string | null;
  sponsorName: string | null;
  status: { stage: "introduced" | "passed_chamber" | "passed_both" | "law" | "vetoed"; label: string };
  committees: string[];
  policyArea: string | null;
  votes: DigestVote[];
  crs: { version: string | null; text: string } | null;
  textVersion: { type: string; date: string } | null;
  /** Full text for single-pass bills; null when not published yet or when the bill is split into parts. */
  text: string | null;
}

export interface DigestMessages {
  system: string;
  user: string;
}

const ROLE = `You explain U.S. legislation to everyday readers (grade 7–8 reading level) so they can decide whether they would support it. You are accurate, concrete, and strictly neutral. You return only JSON.`;

/** Shared rules; the same wording in every pass so single-pass and combined summaries read alike. */
export const RULES = `WHAT TO SAY
- Say what would change in people's lives: money (taxes, fees, benefits, funding), rights and rules (what becomes required, banned, or allowed), and services (health care, schools, veterans' care, and so on).
- Name who is affected in plain words ("airline passengers", "rural veterans", "coal mine operators"), not agencies or legal categories when a person-level group exists.
- Name who acts in plain words ("the Transportation Department", "the IRS", "states"), never "officials" or "the Secretary".
- Refer to programs by what they do, not their legal label: "federal grants for international studies programs", not "Title VI funding". If a legal label must appear, explain it in the same sentence.
- Include the tradeoffs the text itself states: amounts cut or added, fees, new requirements, deadlines, who pays.
- Say what changes from what: when the sources show the current rule or amount and what the bill changes it to ("striking “2024” and inserting “2029”", or the CRS summary describing current law), give both: "extends the program from 2024 to 2029", "keeps the lower rates that were set to expire after 2025". Take the "before" only from the sources, never from memory. If the sources do not say what the rule is today, describe only the new rule.
- Say what the measure reacts to: when it overturns, blocks, delays, or responds to someone's action (a state's rule, an agency decision, a court ruling), name who and what, from the sources: "would overturn federal approval of California's stricter emission rules for harbor boats". State the action and whose it is; do not characterize motives.
- Say what kind of change it is when that matters: a constitutional amendment ("would change the Constitution, not just a law"), a resolution that only expresses a view ("does not change law"), a law's end date being extended, a regulation being overturned.

ACCURACY
- Keep the bill's strength of language. "Requires" only when the text requires; "would allow" when it permits; "would have X consider" when it says consider; "would study" for studies; "authorizes" projects or spending when it authorizes them, "funds" or "provides $X" only when it appropriates money. Never turn "consider", "may", or "authorize" into "must", "will", or "funds".
- Use only facts stated in the SOURCES below. Never change a number, dollar amount, percentage, or date. Write large amounts readably ($45 billion, $5 trillion, $2,200) without changing the value.
- Do not predict effects, costs, or winners and losers beyond what the text says.
- Plain definitions are the one exception: you may explain a term or program in a few common words from general knowledge ("harbor craft, such as tugboats and ferries"; "payments to counties that cannot tax federal land"). Never add numbers, effects, history, or motives that the sources do not state.
- Bills often only amend other laws ("strike X and insert Y"). Name the program or law being changed only if the title, short title, a section header, or the CRS summary names it. If the practical effect cannot be read from the sources, describe the topic ("changes rules for payments to counties with federal land") instead of guessing specifics.
- If the sources conflict, trust the bill text over the CRS summary (the text may be a newer version). But when the text refers to something indirectly (a defined term, a country or program named only by legal reference), use the CRS summary to name it plainly: "Israel", not "a covered country".
- Dates: a recurring deadline is written as recurring ("every year by July 31"); a one-time date includes its year ("by March 1, 2027"); a deadline counted from enactment stays that way ("within 270 days after it becomes law").
- State thresholds exactly as the text does ("people over 65", "under 18", "at least 80 hours"). Do not convert them ("through age 64").

NEUTRALITY
- No judging words: landmark, sweeping, historic, controversial, common-sense, radical, extreme, commonsense, bold, critical, crucial, harmful, dangerous.
- No party framing and no characterizing motives. Describe what the bill does, never whether it is good.

VOTES
- The VOTES listed are what happened on the floor. Never contradict them. If a vote failed, say so plainly ("Failed in the House 212–206; it needed two-thirds"). Do not call a bill "introduced" or "sent to committee" when it has had a floor vote.

TENSE
- Not yet law: "would" ("would ban…", "would require…").
- Law: present tense ("bans…", "requires…").
- Procedural measures (rules for floor debate, scheduling) and commemorative or opinion resolutions: say what kind of measure it is. For a rule, the headline names the most notable measure it sets up ("House sets rules for debating Israel boycott bill and four others"); each key point is one measure, in plain words. Opinion resolutions ("Resolution condemns…") express views and do not change law; say so.

STYLE
- Headline: 6–12 words. Lead with the change for people. Not the bill's name, not "This bill", not "New legislation". Don't mention the vote, the chamber, or whether it passed: the page shows the vote next to the headline. "Resolution would direct U.S. forces out of hostilities with Iran", not "House votes to direct troop pullback".
  Good: "Bill would ban airline fees that exceed what the service costs"
  Bad: "New legislation aims to adjust fees in transportation projects" (vague, and wrong)
  For a bill that changes many things, name the two or three biggest changes for people: "Law extends tax cuts, adds Medicaid work rules, funds border detention", not "Taxes and benefit rules change for families".
- Aim for grade 7–8: short sentences, common words, one idea per sentence. Explain any necessary term in the same sentence. No acronyms unless explained.`;

const OUTPUT = `Return ONLY this JSON:
{
  "headline": "6–12 words",
  "what_it_does": "one sentence, at most 25 words",
  "who_it_affects": ["1–3 groups of people, 2–4 words each"],
  "key_points": [
    { "text": "at most 20 words, one concrete change", "section": "Sec. 2" }
  ],
  "confidence": "text" | "crs" | "title_only"
}
- 2–4 key_points (at most 5 for very long bills). Each is a different concrete change. "section" is the section it comes from ("Sec. 3", "Title VII"), or null if the source has none.
- confidence: "text" when you read the bill text; "crs" when only the CRS summary was available; "title_only" when you only had the title. With title_only, keep every claim to what the title literally says and use 2 key_points at most.`;

const COMBINE_OUTPUT = `${OUTPUT.replace(
  '"confidence": "text" | "crs" | "title_only"',
  `"confidence": "text",
  "inside": [
    { "part": "1–4 words", "summary": "at most 15 words", "section": "Title VII" }
  ]`
)}
- "inside": one row per part that matters to readers (at most 8), biggest effect on people first. Merge tiny or technical parts.
- key_points: the 4–5 changes across the whole bill that affect the most people.`;

const PART_OUTPUT = `Return ONLY this JSON:
{
  "part": "plain name for this part, 1–4 words (e.g. Taxes, Medicaid, Food assistance, Border security)",
  "summary": "one sentence, at most 20 words: what this part changes for people",
  "changes": [
    { "text": "at most 20 words, one concrete change, with its amounts and dates", "section": "Sec. 70101", "who": "people affected, 2–4 words" }
  ]
}
- List the 3–6 changes that matter most to ordinary people, biggest first. Skip technical and conforming amendments.`;

const TWO_THIRDS = (question: string | null, bill: DigestBillInput): boolean =>
  /suspend the rules|overrid/i.test(question ?? "") ||
  (/^(HJRES|SJRES)$/.test(bill.type.toUpperCase()) && /^\s*proposing an amendment to the constitution/i.test(bill.title ?? ""));

export function needsTwoThirds(question: string | null, bill: DigestBillInput): boolean {
  return TWO_THIRDS(question, bill);
}

export function votesLine(bill: DigestBillInput): string {
  if (!bill.votes.length) return "VOTES: none recorded";
  return `VOTES:\n${bill.votes
    .map(
      (v) =>
        `- ${v.chamber}, ${v.vote_date ?? "date unknown"}: ${v.question ?? "vote"} — ${v.result} ${v.yeas}–${v.nays}${TWO_THIRDS(v.question, bill) ? " (needed two-thirds of those voting)" : ""}`
    )
    .join("\n")}`;
}

/** Status for the prompt: text versions say what passed; a recorded vote also says what failed. */
export function statusLabel(bill: DigestBillInput): string {
  const last = bill.votes.at(-1);
  if (bill.status.stage === "introduced" && last) {
    return `${last.result === "Passed" ? "Passed" : "Failed a vote in"} the ${last.chamber} (${last.yeas}–${last.nays}) — not law`;
  }
  return `${bill.status.label}${bill.status.stage === "law" ? " — this is law" : " — not law"}`;
}

function metadata(bill: DigestBillInput): string {
  return `BILL: ${bill.type.toUpperCase()} ${bill.number} (${bill.congress}th Congress)
OFFICIAL TITLE: ${bill.title ?? "unknown"}
SPONSOR: ${bill.sponsorName ?? "unknown"}
STATUS: ${statusLabel(bill)}
COMMITTEES: ${bill.committees.join("; ") || "none listed"}
POLICY AREA: ${bill.policyArea ?? "not yet assigned"}
${votesLine(bill)}`;
}

function crsBlock(bill: DigestBillInput): string {
  return bill.crs
    ? `CRS SUMMARY (Library of Congress, ${bill.crs.version ?? "version unknown"}):\n${bill.crs.text}`
    : "CRS SUMMARY: not yet published";
}

/** A bill that fits in one pass (or has no text yet). */
export function singlePassMessages(bill: DigestBillInput): DigestMessages {
  const body = bill.text && bill.textVersion
    ? `BILL TEXT (${bill.textVersion.type}):\n${bill.text}`
    : "BILL TEXT: not yet published — only the title is available";
  return {
    system: ROLE,
    user: `Summarize this bill for everyday readers.\n\n${metadata(bill)}\n\nSOURCES\n${crsBlock(bill)}\n\n${body}\n\n${RULES}\n\n${OUTPUT}`,
  };
}

/** Pass 1 for long bills: notes on one part (a title, division, or subtitle). */
export function partMessages(bill: DigestBillInput, part: { label: string; text: string }): DigestMessages {
  return {
    system: ROLE,
    user: `This is one part of a long bill. Take notes on this part only; another step combines all parts.\n\n${metadata(bill)}\n\nPART: ${part.label}\n\nPART TEXT:\n${part.text}\n\n${PART_OUTPUT}\n- Accuracy and neutrality rules:\n${RULES}`,
  };
}

/** Pass 2 for long bills: combine part notes into the reader summary plus a "What's inside" breakdown. */
export function combineMessages(bill: DigestBillInput, notes: unknown[]): DigestMessages {
  return {
    system: ROLE,
    user: `Below are notes on every part of a long bill, written from its text. Combine them into one summary for everyday readers.\n\n${metadata(bill)}\n\n${bill.crs ? `CRS SUMMARY (for framing only; the notes come from the text):\n${bill.crs.text}\n\n` : ""}PART NOTES (JSON, in bill order):\n${JSON.stringify(notes, null, 1)}\n\n${RULES}\n\n${COMBINE_OUTPUT}`,
  };
}
