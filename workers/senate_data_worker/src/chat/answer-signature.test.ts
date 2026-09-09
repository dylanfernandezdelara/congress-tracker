import { describe, expect, it } from "vitest";

import { signAnswer, verifyAnswerSignature } from "./answer-signature";

describe("answer signature", () => {
  const secret = "test-chat-hmac-secret";
  const text = "The bill defines a widget as a safety device.";

  it("round-trips a signature", async () => {
    const sig = await signAnswer(secret, text);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    await expect(verifyAnswerSignature(secret, text, sig)).resolves.toBe(true);
  });

  it("rejects a tampered payload or signature", async () => {
    const sig = await signAnswer(secret, text);
    await expect(verifyAnswerSignature(secret, `${text} extra`, sig)).resolves.toBe(false);
    await expect(verifyAnswerSignature(secret, text, `0${sig.slice(1)}`)).resolves.toBe(false);
  });

  it("rejects a wrong-length signature", async () => {
    await expect(verifyAnswerSignature(secret, text, "abcd")).resolves.toBe(false);
    await expect(verifyAnswerSignature(secret, text, "")).resolves.toBe(false);
  });
});
