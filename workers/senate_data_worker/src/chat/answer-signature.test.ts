import { describe, expect, it } from "vitest";

import { answerSignaturePayload, signAnswer, verifyAnswerSignature } from "./answer-signature";

describe("answer signature", () => {
  const secret = "test-chat-hmac-secret";
  const answer = { bill: "119-hr-1", text: "The bill defines a widget as a safety device." };

  it("round-trips a signature", async () => {
    const sig = await signAnswer(secret, answer);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    await expect(verifyAnswerSignature(secret, answer, sig)).resolves.toBe(true);
  });

  it("rejects a tampered payload or signature", async () => {
    const sig = await signAnswer(secret, answer);
    await expect(
      verifyAnswerSignature(secret, { ...answer, text: `${answer.text} extra` }, sig)
    ).resolves.toBe(false);
    await expect(verifyAnswerSignature(secret, answer, `0${sig.slice(1)}`)).resolves.toBe(false);
  });

  it("binds the signature to the bill so it cannot be replayed on another bill", async () => {
    const sig = await signAnswer(secret, answer);
    await expect(verifyAnswerSignature(secret, { ...answer, bill: "119-s-2" }, sig)).resolves.toBe(false);
    // Case/whitespace differences in the bill param are canonicalized, not rejected.
    await expect(verifyAnswerSignature(secret, { ...answer, bill: " 119-HR-1 " }, sig)).resolves.toBe(true);
  });

  it("uses a domain-separated payload", () => {
    expect(answerSignaturePayload(answer)).toBe(`bill-chat-answer\n119-hr-1\n${answer.text}`);
  });

  it("rejects a wrong-length signature", async () => {
    await expect(verifyAnswerSignature(secret, answer, "abcd")).resolves.toBe(false);
    await expect(verifyAnswerSignature(secret, answer, "")).resolves.toBe(false);
  });
});
