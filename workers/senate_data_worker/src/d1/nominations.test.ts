import { describe, expect, it } from "vitest";

import {
  backgroundNeedsVoteContext,
  backgroundNeedsWikipedia,
  parseStoredBackground,
} from "./nominations";

const BASE = {
  headline: "Jane Doe confirmed as Energy Secretary",
  what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
  background: "Jane Doe previously led California energy commission programs.",
  key_points: [],
};

describe("parseStoredBackground vote_context passthrough", () => {
  it("keeps a stored vote_context string", () => {
    const parsed = parseStoredBackground(
      JSON.stringify({ ...BASE, vote_context: "Senators questioned her WHO stance." })
    );
    expect(parsed?.vote_context).toBe("Senators questioned her WHO stance.");
  });

  it("normalizes a blank vote_context to a sealed null", () => {
    const parsed = parseStoredBackground(
      JSON.stringify({ ...BASE, vote_context: "  " })
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.vote_context).toBeNull();
    expect("vote_context" in (parsed ?? {})).toBe(true);
  });

  it("omits vote_context when it was never attempted", () => {
    const parsed = parseStoredBackground(JSON.stringify(BASE));
    expect(parsed).not.toBeNull();
    expect("vote_context" in (parsed ?? {})).toBe(false);
  });
});

describe("backgroundNeedsVoteContext", () => {
  it("waits until Wikipedia has been attempted", () => {
    expect(backgroundNeedsVoteContext({ ...BASE })).toBe(false);
    expect(backgroundNeedsWikipedia({ ...BASE })).toBe(true);
  });

  it("opens after a wiki hit with no vote_context yet", () => {
    expect(
      backgroundNeedsVoteContext({
        ...BASE,
        wikipedia_url: "https://en.wikipedia.org/wiki/Jane_Doe",
        wikipedia_extract: "Jane Doe is an American energy official.",
      })
    ).toBe(true);
  });

  it("opens after a sealed wiki miss so the step can seal vote_context too", () => {
    expect(
      backgroundNeedsVoteContext({
        ...BASE,
        wikipedia_url: null,
        wikipedia_extract: null,
      })
    ).toBe(true);
  });

  it("stays closed once vote_context was attempted", () => {
    expect(
      backgroundNeedsVoteContext({
        ...BASE,
        wikipedia_url: null,
        wikipedia_extract: null,
        vote_context: null,
      })
    ).toBe(false);
    expect(
      backgroundNeedsVoteContext({
        ...BASE,
        wikipedia_url: "https://en.wikipedia.org/wiki/Jane_Doe",
        wikipedia_extract: "Jane Doe is an American energy official.",
        vote_context: "Senators questioned her WHO stance.",
      })
    ).toBe(false);
  });

  it("is false when no background exists", () => {
    expect(backgroundNeedsVoteContext(null)).toBe(false);
  });
});
