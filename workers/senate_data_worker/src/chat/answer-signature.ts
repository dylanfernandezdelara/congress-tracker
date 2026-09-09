const encoder = new TextEncoder();

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

/** HMAC-SHA256 of `text` as lowercase hex. */
export async function signAnswer(secret: string, text: string): Promise<string> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(text));
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
  text: string,
  sig: string
): Promise<boolean> {
  if (typeof sig !== "string" || sig.length === 0) return false;
  const expected = await signAnswer(secret, text);
  return timingSafeEqualHex(expected, sig);
}
