const CONFIRMATION_PATTERNS = [/^on the nomination\b/i];

/** True when the roll is the final confirmation vote on a nomination. */
export function isConfirmationVote(question: string): boolean {
  const q = question.trim().replace(/\s+/g, " ");
  return CONFIRMATION_PATTERNS.some((p) => p.test(q));
}

/**
 * True when the recorded result indicates the nomination was approved.
 * Senate menus typically use "Confirmed"; some rolls say "Agreed to".
 */
export function isConfirmedResult(result: string): boolean {
  const r = result.trim().replace(/\s+/g, " ");
  if (/^not\s+confirmed\b/i.test(r)) return false;
  if (/^rejected\b/i.test(r)) return false;
  if (/^failed\b/i.test(r)) return false;
  return /^(confirmed|agreed to)\b/i.test(r);
}
