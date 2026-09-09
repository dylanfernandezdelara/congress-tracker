import { describe, expect, it } from "vitest";

import { QUOTE_TAG_MAX_CHARS, createQuoteTagParser, type QuoteStreamEvent } from "./quote-stream";

function collect(deltas: string[], flush = true): QuoteStreamEvent[] {
  const events: QuoteStreamEvent[] = [];
  const parser = createQuoteTagParser((event) => events.push(event));
  for (const delta of deltas) parser.push(delta);
  if (flush) parser.flush();
  return events;
}

function joinedText(events: QuoteStreamEvent[]): string {
  return events
    .filter((event): event is Extract<QuoteStreamEvent, { type: "text" }> => event.type === "text")
    .map((event) => event.text)
    .join("");
}

describe("createQuoteTagParser", () => {
  it("emits prose and a quote with a double-quoted section attribute", () => {
    expect(
      collect(['The bill says <quote section="Sec. 3. Definitions">A widget is a device.</quote> later.'])
    ).toEqual([
      { type: "text", text: "The bill says " },
      { type: "quote", section: "Sec. 3. Definitions", text: "A widget is a device." },
      { type: "text", text: " later." },
    ]);
  });

  it("accepts single-quoted attributes and multiple quotes", () => {
    const events = collect([
      `<quote section='CRS summary'>First passage.</quote> and <quote section="Plain-English summary">Second.</quote>`,
    ]);
    expect(events.filter((e) => e.type === "quote")).toEqual([
      { type: "quote", section: "CRS summary", text: "First passage." },
      { type: "quote", section: "Plain-English summary", text: "Second." },
    ]);
  });

  it("reassembles tags split across deltas", () => {
    expect(
      collect(["The bill ", "<quo", 'te section="Sec. 3. Definitions">A wid', "get is a device.</quo", "te> done."])
    ).toEqual([
      { type: "text", text: "The bill " },
      { type: "quote", section: "Sec. 3. Definitions", text: "A widget is a device." },
      { type: "text", text: " done." },
    ]);
  });

  it("does not leak a partial <quote prefix before more deltas arrive", () => {
    const events: QuoteStreamEvent[] = [];
    const parser = createQuoteTagParser((event) => events.push(event));
    parser.push("Hello <quo");
    expect(events).toEqual([{ type: "text", text: "Hello " }]);
    parser.push('te section="Sec. 1">Hi</quote>');
    expect(events).toEqual([
      { type: "text", text: "Hello " },
      { type: "quote", section: "Sec. 1", text: "Hi" },
    ]);
  });

  it("emits an unterminated quote as a quote candidate on flush so a truncated citation is still verified", () => {
    expect(collect(['Before <quote section="Sec. 1">orphaned body'])).toEqual([
      { type: "text", text: "Before " },
      { type: "quote", section: "Sec. 1", text: "orphaned body" },
    ]);
    expect(collect(['Before <quote section="Sec. 1">   '])).toEqual([{ type: "text", text: "Before " }]);
  });

  it("keeps a lone < in prose", () => {
    expect(joinedText(collect(["Use when x < y in the formula."]))).toBe(
      "Use when x < y in the formula."
    );
  });

  it("emits an over-long quote body as text", () => {
    const body = "x".repeat(QUOTE_TAG_MAX_CHARS + 10);
    const events = collect([`<quote section="Sec. 1">${body}</quote>`]);
    expect(events).toEqual([{ type: "text", text: body }]);
  });

  it("flushes a dangling open-tag prefix as text", () => {
    expect(joinedText(collect(["Almost <quo"]))).toBe("Almost <quo");
  });
});
