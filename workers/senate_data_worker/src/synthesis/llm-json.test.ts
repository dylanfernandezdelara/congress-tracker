import { describe, expect, it } from "vitest";

import {
  extractTrailingJsonObject,
  jsonParseCandidates,
  stripMarkdownFence,
} from "./llm-json";

describe("stripMarkdownFence", () => {
  it("unwraps fenced json", () => {
    expect(stripMarkdownFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("leaves bare json alone", () => {
    expect(stripMarkdownFence('{"a":1}')).toBe('{"a":1}');
  });
});

describe("extractTrailingJsonObject", () => {
  it("returns the trailing object after a preamble", () => {
    expect(
      extractTrailingJsonObject('Thinking...\n\n{"vote_context": "ok"}')
    ).toBe('{"vote_context": "ok"}');
  });

  it("rejects text that does not end with a closing brace", () => {
    expect(extractTrailingJsonObject('{"a":1}\nmore')).toBeNull();
  });
});

describe("jsonParseCandidates", () => {
  it("includes trailing JSON when reasoning precedes the answer", () => {
    const candidates = jsonParseCandidates(
      'Let me draft.\n\n{"vote_context": "Hearing focused on WHO."}'
    );
    expect(candidates).toContain('{"vote_context": "Hearing focused on WHO."}');
  });
});
