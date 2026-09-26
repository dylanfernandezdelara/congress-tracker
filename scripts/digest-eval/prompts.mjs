/**
 * Digest eval prompts. One prompt for bills that fit in a single pass; two (per part, then combine) for long
 * bills split along their own titles. Every prompt returns JSON only.
 *
 * The reader: an everyday person deciding whether they would support this bill, and whether their members of
 * Congress voted the way they would. So the summary leads with concrete effects on people's money, rights,
 * services and obligations, names who is affected, and stays strictly neutral.
 */

const SYSTEM = `You explain U.S. legislation to everyday readers (grade 7–8 reading level) so they can decide whether they would support it. You are accurate, concrete, and strictly neutral. You return only JSON.`

/** Shared rules; the same wording in every pass so single-pass and combined summaries read alike. */
const RULES = `WHAT TO SAY
- Say what would change in people's lives: money (taxes, fees, benefits, funding), rights and rules (what becomes required, banned, or allowed), and services (health care, schools, veterans' care, and so on).
- Name who is affected in plain words ("airline passengers", "rural veterans", "coal mine operators"), not agencies or legal categories when a person-level group exists.
- Name who acts in plain words ("the Transportation Department", "the IRS", "states"), never "officials" or "the Secretary".
- Refer to programs by what they do, not their legal label: "federal grants for international studies programs", not "Title VI funding". If a legal label must appear, explain it in the same sentence.
- Include the tradeoffs the text itself states: amounts cut or added, fees, new requirements, deadlines, who pays.

ACCURACY
- Use only facts stated in the SOURCES below. Never change a number, dollar amount, percentage, or date. Write large amounts readably ($45 billion, $5 trillion, $2,200) without changing the value.
- Do not predict effects, costs, or winners and losers beyond what the text says.
- Bills often only amend other laws ("strike X and insert Y"). Name the program or law being changed only if the title, short title, a section header, or the CRS summary names it. If the practical effect cannot be read from the sources, describe the topic ("changes rules for payments to counties with federal land") instead of guessing specifics.
- If the sources conflict, trust the bill text over the CRS summary (the text may be a newer version). But when the text refers to something indirectly (a defined term, a country or program named only by legal reference), use the CRS summary to name it plainly: "Israel", not "a covered country".
- State thresholds exactly as the text does ("people over 65", "under 18", "at least 80 hours"). Do not convert them ("through age 64").

NEUTRALITY
- No judging words: landmark, sweeping, historic, controversial, common-sense, radical, extreme, commonsense, bold, critical, crucial, harmful, dangerous.
- No party framing and no characterizing motives. Describe what the bill does, never whether it is good.

TENSE
- Not yet law: "would" ("would ban…", "would require…").
- Law: present tense ("bans…", "requires…").
- Procedural measures (rules for floor debate, scheduling) and commemorative or opinion resolutions: say what kind of measure it is. For a rule, the headline names the most notable measure it sets up ("House sets rules for debating Israel boycott bill and four others"); each key point is one measure, in plain words. Opinion resolutions ("Resolution condemns…") express views and do not change law; say so.

STYLE
- Headline: 6–12 words. Lead with the change for people. Not the bill's name, not "This bill", not "New legislation".
  Good: "Bill would ban airline fees that exceed what the service costs"
  Bad: "New legislation aims to adjust fees in transportation projects" (vague, and wrong)
  For a bill that changes many things, name the two or three biggest changes for people: "Law extends tax cuts, adds Medicaid work rules, funds border detention", not "Taxes and benefit rules change for families".
- Aim for grade 7–8: short sentences, common words, one idea per sentence. Explain any necessary term in the same sentence. No acronyms unless explained.`

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
- confidence: "text" when you read the bill text; "crs" when only the CRS summary was available; "title_only" when you only had the title. With title_only, keep every claim to what the title literally says and use 2 key_points at most.`

function metadata(bill) {
  const sponsor = bill.sponsor ? `${bill.sponsor.name}` : 'unknown'
  return `BILL: ${bill.type} ${bill.number} (${bill.congress}th Congress)
OFFICIAL TITLE: ${bill.title}
SPONSOR: ${sponsor}
STATUS: ${bill.status.label}${bill.status.stage === 'law' ? ' — this is law' : ' — not law'}
COMMITTEES: ${bill.committees.join('; ') || 'none listed'}
POLICY AREA: ${bill.policyArea ?? 'not yet assigned'}`
}

function sources(bill, text) {
  const crs = bill.crs
    ? `CRS SUMMARY (Library of Congress, ${bill.crs.version ?? 'version unknown'}):\n${bill.crs.text}`
    : 'CRS SUMMARY: not yet published'
  const body = text
    ? `BILL TEXT (${bill.textVersion.type}):\n${text}`
    : 'BILL TEXT: not yet published — only the title is available'
  return `${crs}\n\n${body}`
}

/** A bill that fits in one pass. */
export function singlePassMessages(bill) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Summarize this bill for everyday readers.\n\n${metadata(bill)}\n\nSOURCES\n${sources(bill, bill.text)}\n\n${RULES}\n\n${OUTPUT}`,
    },
  ]
}

/** Pass 1 for long bills: notes on one part (a title, division, or subtitle). */
export function partMessages(bill, part) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `This is one part of a long bill. Take notes on this part only; another step combines all parts.

${metadata(bill)}

PART: ${part.label}

PART TEXT:
${part.text}

Return ONLY this JSON:
{
  "part": "plain name for this part, 1–4 words (e.g. Taxes, Medicaid, Food assistance, Border security)",
  "summary": "one sentence, at most 20 words: what this part changes for people",
  "changes": [
    { "text": "at most 20 words, one concrete change, with its amounts and dates", "section": "Sec. 70101", "who": "people affected, 2–4 words" }
  ]
}
- List the 3–6 changes that matter most to ordinary people, biggest first. Skip technical and conforming amendments.
- Accuracy and neutrality rules:
${RULES}`,
    },
  ]
}

/** Pass 2 for long bills: combine part notes into the reader summary plus a "What's inside" breakdown. */
export function combineMessages(bill, notes) {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Below are notes on every part of a long bill, written from its text. Combine them into one summary for everyday readers.

${metadata(bill)}

${bill.crs ? `CRS SUMMARY (for framing only; the notes come from the text):\n${bill.crs.text}\n\n` : ''}PART NOTES (JSON, in bill order):
${JSON.stringify(notes, null, 1)}

${RULES}

${OUTPUT.replace('"confidence": "text" | "crs" | "title_only"', `"confidence": "text",
  "inside": [
    { "part": "1–4 words", "summary": "at most 15 words", "section": "Title VII" }
  ]`)}
- "inside": one row per part that matters to readers (at most 8), biggest effect on people first. Merge tiny or technical parts.
- key_points: the 4–5 changes across the whole bill that affect the most people.`,
    },
  ]
}
