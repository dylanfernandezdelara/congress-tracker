const encoder = new TextEncoder();

/**
 * Domain separator so an answer MAC can never collide with any other HMAC use
 * of the same secret.
 */
const ANSWER_SIGNATURE_DOMAIN = "bill-chat-answer";

export type SignedAnswer = {
  /** Canonical bill param the answer was produced for, e.g. `119-hr-1`. */
  bill: string;
  /** Final answer prose exactly as sent in `data-answer.text`. */
  text: string;
};

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/**
 * The bill is part of the signed payload so a signature captured while chatting
 * about one bill cannot be replayed to store the same prose as a quote on
 * another bill.
 */
export function answerSignaturePayload(answer: SignedAnswer): string {
  return `${ANSWER_SIGNATURE_DOMAIN}\n${answer.bill.trim().toLowerCase()}\n${answer.text}`;
}

/** HMAC-SHA256 of the bill-bound payload as lowercase hex. */
export async function signAnswer(secret: string, answer: SignedAnswer): Promise<string> {
  const mac = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(answerSignaturePayload(answer))
  );
  return toHex(mac);
}

function timingSafeEqualHex(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  const hex = /^[0-9a-f]+$/;
  if (!hex.test(a) || !hex.test(b)) return false;
  const max = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function verifyAnswerSignature(
  secret: string,
  answer: SignedAnswer,
  sig: string
): Promise<boolean> {
  if (typeof sig !== "string" || sig.length === 0) return false;
  const expected = await signAnswer(secret, answer);
  return timingSafeEqualHex(expected, sig);
}
