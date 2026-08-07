import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../config";
import {
  buildVoteContextPrompt,
  rewriteVoteContext,
  selectVoteContextSource,
} from "./confirmation-vote-context";

const ARTICLE = `Erica G. Schwartz is an American health official currently serving as the Director of the Centers for Disease Control and Prevention (CDC).

== Early life and education ==
Schwartz's father was a career Navy master chief petty officer stationed in San Diego, and she has three siblings who served in the military and public safety roles.

== Director of the Centers for Disease Control and Prevention ==
On April 16, 2026, President Donald Trump named Schwartz as his nominee for director of the Centers for Disease Control and Prevention. In a July 2026 Senate nomination hearing, Schwartz stated that she supported the withdrawal of the United States from the World Health Organization.
On August 5, 2026, Schwartz was confirmed by the Senate as CDC Director in a 51-44 vote, becoming its first permanent leader in over a year.`;

describe("confirmation vote-context adapter", () => {
  it("selectVoteContextSource keeps confirmation/hearing paragraphs", () => {
    const source = selectVoteContextSource(ARTICLE);
    expect(source).toContain("Senate nomination hearing");
    expect(source).toContain("World Health Organization");
    expect(source).not.toContain("master chief petty officer");
  });

  it("buildVoteContextPrompt frames confirmation identity and Wikipedia source", () => {
    const prompt = buildVoteContextPrompt({
      nomineeName: "Erica Schwartz",
      positionTitle: "Director of the Centers for Disease Control and Prevention",
      sourceText: "Hearing text",
    });
    expect(prompt).toContain("U.S. Senate confirmation");
    expect(prompt).toContain("NOMINEE: Erica Schwartz");
    expect(prompt).toContain("CONFIRMED AS: Director of the Centers for Disease Control and Prevention");
    expect(prompt).toContain("the nominee's Wikipedia article");
    expect(prompt).toContain('"vote_context"');
    expect(prompt).toContain("General biography or career praise is not vote context");
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
