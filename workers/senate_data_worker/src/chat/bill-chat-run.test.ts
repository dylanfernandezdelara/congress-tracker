import { describe, expect, it } from "vitest";

import {
  BILL_CHAT_MAX_HISTORY_TURNS,
  BILL_CHAT_STREAM_ERROR_TEXT,
  BILL_CHAT_UNVERIFIED_PLACEHOLDER,
} from "../../../../shared/chat-api-types";
import { verifyAnswerSignature } from "./answer-signature";
import type { EvidenceChunk } from "./bill-chat-evidence";
import {
  BILL_CHAT_REFUSAL_PREFIX,
  applySelection,
  buildBillChatSystemPrompt,
  filterChatHistory,
  isAbortError,
  latestUserQuestion,
  writeBillChatStream,
  type BillChatStreamWriter,
} from "./bill-chat-run";

const BILL = { congress: 119, type: "hr", number: 1 };

const DIGEST: EvidenceChunk = {
  id: "digest",
  source: "digest",
  section_label: "Plain-English summary",
  text: "Speeds energy permits across states. Caps environmental review at two years.",
};

const SECTION: EvidenceChunk = {
  id: "bill_text-2",
  source: "bill_text",
  section_label: "Sec. 3. Definitions",
  text: "A widget is a device. The Secretary shall publish an annual report.",
};

function user(text: string, id = "u") {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistant(text: string, id = "a") {
  return { id, role: "assistant", parts: [{ type: "text", text }] };
}

/** Collects every chunk the stream writer emits so tests can assert on the sequence. */
function recordingWriter(): { writer: BillChatStreamWriter; chunks: Array<Record<string, unknown>> } {
  const chunks: Array<Record<string, unknown>> = [];
  const writer = {
    write: (chunk: unknown) => {
      chunks.push(chunk as Record<string, unknown>);
    },
    merge: () => {},
    onError: undefined,
  } as unknown as BillChatStreamWriter;
  return { writer, chunks };
}

async function* stream(...deltas: string[]): AsyncGenerator<string> {
  for (const delta of deltas) yield delta;
}

function deltas(chunks: Array<Record<string, unknown>>): string {
  return chunks
    .filter((c) => c.type === "text-delta")
    .map((c) => String(c.delta))
    .join("");
}

describe("latestUserQuestion", () => {
  it("returns the trimmed text of the newest user message", () => {
    expect(latestUserQuestion([user("first"), assistant("reply"), user("  second  ")])).toBe("second");
  });

  it("returns null when the newest user message has no usable text", () => {
    expect(latestUserQuestion([user("   ")])).toBeNull();
    expect(latestUserQuestion([{ id: "u", role: "user", parts: [{ type: "file" }] }])).toBeNull();
    expect(latestUserQuestion([assistant("only assistant")])).toBeNull();
    expect(latestUserQuestion([])).toBeNull();
  });
});

describe("filterChatHistory", () => {
  it("keeps only user/assistant text parts and drops trailing assistant turns", () => {
    const history = filterChatHistory([
      { id: "s", role: "system", parts: [{ type: "text", text: "ignored" }] },
      { id: "u1", role: "user", parts: [{ type: "text", text: "Q1" }, { type: "file", url: "x" }] },
      { id: "a1", role: "assistant", parts: [{ type: "data-quote", data: {} }, { type: "text", text: "A1" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "Q2" }] },
      { id: "a2", role: "assistant", parts: [{ type: "text", text: "dangling" }] },
      "not a message",
      null,
    ]);
    expect(history).toEqual([
      { id: "u1", role: "user", parts: [{ type: "text", text: "Q1" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "A1" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "Q2" }] },
    ]);
  });

  it("caps the window at the newest BILL_CHAT_MAX_HISTORY_TURNS user turns", () => {
    const messages: unknown[] = [];
    for (let i = 0; i < 10; i++) {
      messages.push(user(`Q${i}`, `u${i}`), assistant(`A${i}`, `a${i}`));
    }
    messages.push(user("latest", "last"));
    const history = filterChatHistory(messages);
    const users = history.filter((m) => m.role === "user");
    expect(users).toHaveLength(BILL_CHAT_MAX_HISTORY_TURNS);
    expect(history[0]!.role).toBe("user");
    expect(history.at(-1)!.id).toBe("last");
  });

  it("synthesizes ids for messages without one", () => {
    const history = filterChatHistory([{ role: "user", parts: [{ type: "text", text: "Q" }] }]);
    expect(history[0]!.id).toBe("m0");
  });
});

describe("applySelection", () => {
  const history = filterChatHistory([user("Q1", "u1"), assistant("A1", "a1"), user("What is this?", "u2")]);

  it("prepends the selected passage to the newest user turn only", () => {
    const applied = applySelection(history, "  A widget is a device.  ");
    expect(applied).toHaveLength(3);
    expect(applied[0]).toEqual(history[0]);
    expect(applied[2]!.parts).toEqual([
      { type: "text", text: "Selected passage: A widget is a device." },
      { type: "text", text: "What is this?" },
    ]);
  });

  it("is a no-op for blank selections or when the last turn is not a user turn", () => {
    expect(applySelection(history, undefined)).toBe(history);
    expect(applySelection(history, "   ")).toBe(history);
    const assistantLast = [...history.slice(0, 2)];
    expect(applySelection(assistantLast, "text")).toBe(assistantLast);
  });
});

describe("buildBillChatSystemPrompt", () => {
  it("lists each evidence block under its label and states the refusal and final-answer rules", () => {
    const prompt = buildBillChatSystemPrompt({ title: "Widget Act", bill: BILL, chunks: [DIGEST, SECTION] });
    expect(prompt).toContain("Widget Act (119-hr-1)");
    expect(prompt).toContain("### Plain-English summary\nSpeeds energy permits");
    expect(prompt).toContain("### Sec. 3. Definitions\nA widget is a device.");
    expect(prompt).toContain(`beginning "${BILL_CHAT_REFUSAL_PREFIX}"`);
    expect(prompt).toContain("final answer only");
  });

  it("falls back to the bill id as the title and marks missing evidence", () => {
    const prompt = buildBillChatSystemPrompt({ title: "", bill: BILL, chunks: [] });
    expect(prompt).toContain("119-hr-1 (119-hr-1)");
    expect(prompt).toContain("(no evidence)");
  });
});

describe("writeBillChatStream", () => {
  it("emits prose as text parts, verified quotes as data-quote, and a bill-bound signed answer", async () => {
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({
      writer,
      bill: BILL,
      chunks: [DIGEST, SECTION],
      hmacSecret: "unit-secret",
      textStream: stream(
        "The bill defines a widget: ",
        '<quote section="Sec. 3. Definitions">A widget is a device.</quote>',
        " It also ",
        '<quote section="Plain-English summary">caps environmental review at two years.</quote>'
      ),
    });

    const types = chunks.map((c) => c.type);
    expect(types).toEqual([
      "text-start",
      "text-delta",
      "text-end",
      "data-quote",
      "text-start",
      "text-delta",
      "text-end",
      "data-quote",
      "data-answer",
    ]);
    // Text ids increment across quote interruptions so the client keeps separate paragraphs.
    const starts = chunks.filter((c) => c.type === "text-start").map((c) => c.id);
    expect(starts).toEqual(["text-0", "text-1"]);

    const quotes = chunks.filter((c) => c.type === "data-quote").map((c) => c.data);
    expect(quotes[0]).toMatchObject({
      text: "A widget is a device.",
      section_label: "Sec. 3. Definitions",
      source: "bill_text",
    });
    expect(quotes[1]).toMatchObject({
      text: "Caps environmental review at two years.",
      section_label: "Plain-English summary",
      source: "digest",
    });

    const answer = chunks.at(-1)!.data as { text: string; sig: string; unverified_quotes: number; refused: boolean };
    expect(answer.text).toBe("The bill defines a widget:  It also");
    expect(answer.unverified_quotes).toBe(0);
    expect(answer.refused).toBe(false);
    await expect(
      verifyAnswerSignature("unit-secret", { bill: "119-hr-1", text: answer.text }, answer.sig)
    ).resolves.toBe(true);
    await expect(
      verifyAnswerSignature("unit-secret", { bill: "119-s-2", text: answer.text }, answer.sig)
    ).resolves.toBe(false);
  });

  it("replaces a quote the evidence does not contain with the placeholder and counts it", async () => {
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({
      writer,
      bill: BILL,
      chunks: [SECTION],
      textStream: stream('Claim: <quote section="Sec. 3. Definitions">this was never in the bill</quote> done.'),
    });
    expect(chunks.some((c) => c.type === "data-quote")).toBe(false);
    expect(deltas(chunks)).toBe(`Claim: ${BILL_CHAT_UNVERIFIED_PLACEHOLDER} done.`);
    const answer = chunks.at(-1)!.data as { unverified_quotes: number; sig: string | null };
    expect(answer.unverified_quotes).toBe(1);
    expect(answer.sig).toBeNull();
  });

  it("attributes a passage present in several blocks to the section the model cited", async () => {
    const shared = "The Secretary shall publish an annual report.";
    const digestWithOverlap: EvidenceChunk = { ...DIGEST, text: `${DIGEST.text} ${shared}` };
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({
      writer,
      bill: BILL,
      chunks: [digestWithOverlap, SECTION],
      textStream: stream(`See <quote section="Sec. 3. Definitions">${shared}</quote>`),
    });
    const quote = chunks.find((c) => c.type === "data-quote")!.data as { section_label: string };
    expect(quote.section_label).toBe("Sec. 3. Definitions");
  });

  it("flags a refusal and still signs it", async () => {
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({
      writer,
      bill: BILL,
      chunks: [SECTION],
      hmacSecret: "unit-secret",
      textStream: stream(`${BILL_CHAT_REFUSAL_PREFIX}; it only defines terms.`),
    });
    const answer = chunks.at(-1)!.data as { refused: boolean; sig: string | null };
    expect(answer.refused).toBe(true);
    expect(answer.sig).toEqual(expect.any(String));
  });

  it("writes an error part instead of a signed answer when the provider reported an error", async () => {
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({
      writer,
      bill: BILL,
      chunks: [SECTION],
      hmacSecret: "unit-secret",
      textStream: stream(),
      streamError: () => new Error("upstream overloaded"),
    });
    expect(chunks).toEqual([{ type: "error", errorText: BILL_CHAT_STREAM_ERROR_TEXT }]);
  });

  it("writes an error part when the answer is blank", async () => {
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({ writer, bill: BILL, chunks: [SECTION], textStream: stream("  ", "\n") });
    expect(chunks.at(-1)).toEqual({ type: "error", errorText: BILL_CHAT_STREAM_ERROR_TEXT });
    expect(chunks.some((c) => c.type === "data-answer")).toBe(false);
  });

  it("closes open text and writes an error part when the stream throws", async () => {
    async function* failing(): AsyncGenerator<string> {
      yield "Partial ";
      throw new Error("socket closed");
    }
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({ writer, bill: BILL, chunks: [SECTION], textStream: failing() });
    expect(chunks.map((c) => c.type)).toEqual(["text-start", "text-delta", "text-end", "error"]);
  });

  it("stays silent when the stream ends because the reader aborted", async () => {
    async function* aborted(): AsyncGenerator<string> {
      yield "Partial ";
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({ writer, bill: BILL, chunks: [SECTION], textStream: aborted() });
    expect(chunks.map((c) => c.type)).toEqual(["text-start", "text-delta", "text-end"]);
    expect(isAbortError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });

  it("stays silent when the SDK reports the abort through onError and the stream simply ends", async () => {
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({
      writer,
      bill: BILL,
      chunks: [SECTION],
      textStream: stream(),
      streamError: () => new DOMException("The operation was aborted.", "AbortError"),
    });
    expect(chunks).toEqual([]);
  });

  it("verifies a quote cut off by the output cap as a passage when its prefix is verbatim", async () => {
    const { writer, chunks } = recordingWriter();
    await writeBillChatStream({
      writer,
      bill: BILL,
      chunks: [SECTION],
      textStream: stream('Answer: <quote section="Sec. 3. Definitions">A widget is a'),
    });
    const quote = chunks.find((c) => c.type === "data-quote")!.data as { text: string };
    expect(quote.text).toBe("A widget is a");
    expect(chunks.at(-1)!.type).toBe("data-answer");
  });
});
