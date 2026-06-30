const PASSAGE_PATTERNS = [
  /^on passage of the bill/i,
  /^on passage/i,
  /^on motion to suspend the rules and pass/i,
  /^on agreeing to the resolution/i,
  /^on the conference report/i,
  /^on motion to agree to the (senate|house)/i,
  /^motion to concur in/i,
];

export function isPassageVote(question: string): boolean {
  const q = question.trim().replace(/\s+/g, " ");
  return PASSAGE_PATTERNS.some((p) => p.test(q));
}
