import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../config";
import {
  parseVoteContextJson,
  rewriteVoteContext,
  selectVoteContextSource,
} from "./confirmation-vote-context";

const ARTICLE = `Erica G. Schwartz is an American health official currently serving as the Director of the Centers for Disease Control and Prevention (CDC).

== Early life and education ==
Schwartz's father was a career Navy master chief petty officer stationed in San Diego, and she has three siblings who served in the military and public safety roles.

== Director of the Centers for Disease Control and Prevention ==
On April 16, 2026, President Donald Trump named Schwartz as his nominee for director of the Centers for Disease Control and Prevention. In a July 2026 Senate nomination hearing, Schwartz stated that she supported the withdrawal of the United States from the World Health Organization.
On August 5, 2026, Schwartz was confirmed by the Senate as CDC Director in a 51-44 vote, becoming its first permanent leader in over a year.`;

describe("selectVoteContextSource", () => {
  it("keeps nomination/hearing paragraphs and drops unrelated biography", () => {
    const source = selectVoteContextSource(ARTICLE);
    expect(source).toContain("Senate nomination hearing");
    expect(source).toContain("World Health Organization");
    expect(source).not.toContain("master chief petty officer");
    expect(source).not.toContain("== Director");
  });

  it("returns null when the article never mentions the nomination or vote", () => {
    expect(
      selectVoteContextSource(
        "Jane Doe is a physician from Ohio who practices family medicine in Columbus and teaches at a local college."
      )
    ).toBeNull();
  });

  it("returns null for empty articles", () => {
    expect(selectVoteContextSource("")).toBeNull();
  });
});

describe("parseVoteContextJson", () => {
  it("parses plain JSON", () => {
    expect(
      parseVoteContextJson('{"vote_context": "Senators questioned her WHO stance."}')
    ).toBe("Senators questioned her WHO stance.");
  });

  it("parses fenced JSON", () => {
    expect(
      parseVoteContextJson('```json\n{"vote_context": "Hearing focused on vaccine policy."}\n```')
    ).toBe("Hearing focused on vaccine policy.");
  });

  it("extracts trailing JSON after a reasoning preamble", () => {
    expect(
      parseVoteContextJson(
        'Let me check the source text for stated reasons.\n\n{"vote_context": "She backed WHO withdrawal at her hearing."}'
      )
    ).toBe("She backed WHO withdrawal at her hearing.");
  });

  it("returns empty string when the model found nothing grounded", () => {
    expect(parseVoteContextJson('{"vote_context": ""}')).toBe("");
  });

  it("returns null for unparseable output", () => {
    expect(parseVoteContextJson("I could not produce JSON because")).toBeNull();
  });
});

describe("rewriteVoteContext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const env = { OPENROUTER_API_KEY: "test-key" } as Env;
  const params = {
    nomineeName: "Erica Schwartz",
    positionTitle: "Director of the Centers for Disease Control and Prevention",
    sourceText: "In a July 2026 Senate nomination hearing, Schwartz supported WHO withdrawal.",
  };

  it("returns grounded text on the first attempt", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"vote_context": "At her hearing she backed WHO withdrawal."}',
              },
            },
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteVoteContext(env, params, "openrouter/free");
    expect(result).toEqual({
      status: "ok",
      text: "At her hearing she backed WHO withdrawal.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps an empty grounded answer to ok/null (safe to seal)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"vote_context": ""}' } }],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteVoteContext(env, params, "openrouter/free");
    expect(result).toEqual({ status: "ok", text: null });
  });

  it("returns unavailable when both attempts fail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await rewriteVoteContext(env, params, "openrouter/free");
    expect(result).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
