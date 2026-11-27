import type { CheckableSummary } from "../digest/checks";
import { parseJsonObject } from "../digest/parse";
import { statusLabel, votesLine, type DigestBillInput, type DigestMessages } from "../digest/prompt";

/*
 * Pairwise judge for eval rounds: which of two summaries of one bill would help an everyday reader more. The judge
 * sees the bill text (never the CRS summary, which can itself be a contestant), the two summaries labeled A and B,
 * and a rubric taken from Dylan's notes on round 8. Rounds ask for both orders of every pair, so a judge that
 * favors whichever summary it reads first shows up as disagreement between the two orders, not as a winner.
 *
 * A judge is trusted only as far as it agrees with Dylan's own picks on the same summaries (calibration rounds).
 */

/** A contestant as the judge shows it: a summary the worker wrote, or the official CRS text. */
export type JudgedSummary = { kind: "summary"; summary: CheckableSummary } | { kind: "crs"; text: string };

const SYSTEM = `You compare two plain-language summaries of the same U.S. bill and decide which would help an everyday reader more. You check every claim against the bill text. You are neutral about politics. You return only JSON.`;

const RUBRIC = `Decide which summary a typical reader (grade 7–8 reading level, a minute to spare) would come away from understanding the bill better, and more correctly. In order of importance:
1. Correct: every claim matches the BILL TEXT, with the same strength ("would allow" is not "requires"; "authorizes" is not "funds"). A wrong or invented claim outweighs any amount of clarity. A plain definition of a term is fine.
2. Outcome: the headline and first sentence say what changes for people and for whom, with concrete words, not vague ones ("places", "efforts", "measures").
3. How and when: the reader learns the mechanism (a grant, a tax credit, a ban, a right to sue) and the conditions under which it applies, so they never wonder "why would that happen?" or "when does this apply?".
4. Main subject first: what most of the bill is about appears early, not only in a last point.
5. Plain and short: plain words, no repeated points, nothing a reader would skip. More text is not better.
Layout differs between summaries (bulleted or one paragraph); judge what the reader understands, and count layout only when it makes the summary harder to read.
If they are about equally good, say "tie".`;

function render(s: JudgedSummary): string {
  if (s.kind === "crs") return s.text.trim();
  const x = s.summary;
  return [
    `Title: ${x.headline}`,
    `What it does: ${x.what_it_does}`,
    x.who_it_affects?.length ? `Who it affects: ${x.who_it_affects.join("; ")}` : null,
    x.key_points?.length ? `Key points:\n${x.key_points.map((k) => `- ${k.text}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function judgeMessages(bill: DigestBillInput, a: JudgedSummary, b: JudgedSummary): DigestMessages {
  const text = bill.text && bill.textVersion ? `BILL TEXT (${bill.textVersion.type}):\n${bill.text}` : "BILL TEXT: not published; judge from the title only";
  return {
    system: SYSTEM,
    user: `BILL: ${bill.type.toUpperCase()} ${bill.number} (${bill.congress}th Congress)
OFFICIAL TITLE: ${bill.title ?? "unknown"}
STATUS: ${statusLabel(bill)}
${votesLine(bill)}

${text}

SUMMARY A:
${render(a)}

SUMMARY B:
${render(b)}

${RUBRIC}

Return ONLY this JSON, filling the fields in order:
{
  "errors_a": ["each claim in A that the bill text does not support, or none"],
  "errors_b": ["each claim in B that the bill text does not support, or none"],
  "comparison": "two or three sentences on which a reader would understand better, and why",
  "winner": "A" | "B" | "tie",
  "margin": "slight" | "clear"
}`,
  };
}

export interface Verdict {
  winner: "A" | "B" | "tie";
  margin: "slight" | "clear" | null;
  errors_a: string[];
  errors_b: string[];
  comparison: string | null;
}

export function parseVerdict(content: string | null | undefined): Verdict | null {
  const j = parseJsonObject(content);
  if (!j) return null;
  const w = typeof j.winner === "string" ? j.winner.trim().toUpperCase() : "";
  const winner = w === "A" ? "A" : w === "B" ? "B" : w === "TIE" ? "tie" : null;
  if (!winner) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "" && !/^none\.?$/i.test(x.trim())) : []);
  return {
    winner,
    margin: j.margin === "slight" || j.margin === "clear" ? j.margin : null,
    errors_a: list(j.errors_a),
    errors_b: list(j.errors_b),
    comparison: typeof j.comparison === "string" ? j.comparison : null,
  };
}
