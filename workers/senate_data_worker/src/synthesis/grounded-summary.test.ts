import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../config";
import {
  buildContestedVotePrompt,
  parseGroundedStringField,
  rewriteGroundedStringField,
  selectSourceParagraphs,
} from "./grounded-summary";

const ARTICLE = `Erica G. Schwartz is an American health official currently serving as the Director of the Centers for Disease Control and Prevention (CDC).

== Early life and education ==
Schwartz's father was a career Navy master chief petty officer stationed in San Diego, and she has three siblings who served in the military and public safety roles.

== Director of the Centers for Disease Control and Prevention ==
On April 16, 2026, President Donald Trump named Schwartz as his nominee for director of the Centers for Disease Control and Prevention. In a July 2026 Senate nomination hearing, Schwartz stated that she supported the withdrawal of the United States from the World Health Organization.
On August 5, 2026, Schwartz was confirmed by the Senate as CDC Director in a 51-44 vote, becoming its first permanent leader in over a year.`;

const CUE =
  /\b(?:nominat|confirm|senate|hearing|vote|oppos|controvers|criticiz|testif|committee)/i;

describe("selectSourceParagraphs", () => {
  it("keeps cue-matching paragraphs and drops biography/headings", () => {
    const source = selectSourceParagraphs(ARTICLE, CUE);
    expect(source).toContain("Senate nomination hearing");
    expect(source).toContain("World Health Organization");
    expect(source).not.toContain("master chief petty officer");
    expect(source).not.toContain("== Director");
  });

  it("returns null when nothing matches the cue", () => {
    expect(
      selectSourceParagraphs(
        "Jane Doe is a physician from Ohio who practices family medicine in Columbus and teaches at a local college.",
        CUE
      )
    ).toBeNull();
  });
});

describe("buildContestedVotePrompt", () => {
  it("is domain-agnostic: bills can reuse the same template", () => {
    const prompt = buildContestedVotePrompt({
      voteKind: "House passage",
      identityLines: [
        { label: "BILL", value: "H.R. 1234" },
        { label: "TITLE", value: "Example Act" },
      ],
      sourceLabel: "the CRS summary and companion vote questions",
      sourceText: "The amendment fight centered on spending caps.",
      fieldName: "vote_context",
      fieldDescription: "1-2 sentences on why passage was contested.",
      excludeGuidance:
        "Do not restate the tally or rehash the bill summary — only the contest.",
    });

    expect(prompt).toContain("House passage");
    expect(prompt).toContain("BILL: H.R. 1234");
    expect(prompt).toContain("CRS summary");
    expect(prompt).toContain('"vote_context"');
    expect(prompt).toContain("Never invent reasons");
  });
});

describe("parseGroundedStringField", () => {
  it("parses the named field and maps empty to empty string", () => {
    expect(
      parseGroundedStringField(
        '{"vote_context": "Senators questioned her WHO stance."}',
        "vote_context",
        360
      )
    ).toBe("Senators questioned her WHO stance.");
    expect(
      parseGroundedStringField('{"vote_context": ""}', "vote_context", 360)
    ).toBe("");
  });

  it("returns null for the wrong field name", () => {
    expect(
      parseGroundedStringField('{"other": "x"}', "vote_context", 360)
    ).toBeNull();
  });
});

describe("rewriteGroundedStringField", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const env = { OPENROUTER_API_KEY: "test-key" } as Env;

  it("returns ok/text on a successful grounded parse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
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
      )
    );

    const result = await rewriteGroundedStringField(env, {
      model: "openrouter/free",
      prompt: "test",
      fieldName: "vote_context",
      maxChars: 360,
    });
    expect(result).toEqual({
      status: "ok",
      text: "At her hearing she backed WHO withdrawal.",
    });
  });

  it("maps empty grounded answers to ok/null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"vote_context": ""}' } }],
          }),
          { status: 200 }
        )
      )
    );

    const result = await rewriteGroundedStringField(env, {
      model: "openrouter/free",
      prompt: "test",
      fieldName: "vote_context",
      maxChars: 360,
    });
    expect(result).toEqual({ status: "ok", text: null });
  });
});
