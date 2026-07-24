import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DIGEST_BULLET_MAX_WORDS,
  DIGEST_MAX_BULLETS,
} from "../../../../shared/feed-content";
import type { Env } from "../config";
import { parseDigestJson, rewriteSummary } from "./openrouter";
import { truncateCrsSummaryForRewrite } from "./crs-truncate";

describe("parseDigestJson", () => {
  it("parses valid digest JSON", () => {
    const parsed = parseDigestJson(
      JSON.stringify({
        headline: "Test headline here",
        what_it_does: "It does something plain.",
        key_points: ["one", "two"],
        terms_explained: [{ term: "FAA", plain: "aviation agency" }],
      })
    );
    expect(parsed?.headline).toBe("Test headline here");
    expect(parsed?.key_points).toHaveLength(2);
  });

  it("reduces what_it_does to its first sentence", () => {
    const parsed = parseDigestJson(
      JSON.stringify({
        headline: "Test headline here",
        what_it_does:
          "This bill blocks aid for ghost students. It also creates reporting rules and audit requirements for schools.",
        key_points: ["one", "two"],
        terms_explained: [{ term: "FAA", plain: "aviation agency" }],
      })
    );
    expect(parsed?.what_it_does).toBe("This bill blocks aid for ghost students.");
  });

  it("keeps normal-length bullets intact", () => {
    const bullet =
      "Requires annual enrollment verification from participating institutions";
    const parsed = parseDigestJson(
      JSON.stringify({
        headline: "Test headline here",
        what_it_does: "Does a thing.",
        key_points: [bullet, "two"],
        terms_explained: [],
      })
    );
    expect(parsed?.key_points[0]).toBe(bullet);
    expect(parsed?.key_points).toHaveLength(2);
  });

  it("truncates over-long bullets at the word cap and limits bullet count", () => {
    const longBullet = Array.from(
      { length: DIGEST_BULLET_MAX_WORDS + 10 },
      (_, index) => `word${index}`
    ).join(" ");
    const extraBullets = Array.from(
      { length: DIGEST_MAX_BULLETS + 3 },
      (_, index) => `bullet ${index}`
    );
    const parsed = parseDigestJson(
      JSON.stringify({
        headline: "Test headline here",
        what_it_does: "Does a thing.",
        key_points: [longBullet, ...extraBullets],
        terms_explained: [],
      })
    );
    expect(parsed?.key_points[0].endsWith("…")).toBe(true);
    expect(parsed?.key_points[0].split(" ")).toHaveLength(DIGEST_BULLET_MAX_WORDS);
    expect(parsed?.key_points).toHaveLength(DIGEST_MAX_BULLETS);
  });

  it("returns null for invalid JSON", () => {
    expect(parseDigestJson("not json")).toBeNull();
  });
});

describe("rewriteSummary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries with a compact prompt when the full completion is truncated JSON", async () => {
    const truncated = `{
  "headline": "Sets Federal Budget Plan Through 2036",
  "what_it_does": "This resolution sets the federal budget through 2036.",
  "key_points": ["Sets budget targets through 2036"],
  "terms_explained": [{ "term": "FY", "plain": "Fiscal Year — the government's
`;
    const compact = JSON.stringify({
      headline: "Sets the federal budget through 2036",
      what_it_does: "This resolution sets federal budget targets through 2036.",
      key_points: ["Sets revenue and spending targets", "Allows deficit-increasing bills"],
      terms_explained: [],
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: truncated } }] }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: compact } }] }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const longCrs = `${"This concurrent resolution establishes the congressional budget. ".repeat(40)}`;
    const env = { OPENROUTER_API_KEY: "test-key", OPENROUTER_MODEL: "openrouter/free" } as Env;

    const digest = await rewriteSummary(env, {
      title: "Establishing the congressional budget",
      billLabel: "H.Con.Res. 113 · 119th Congress",
      policyArea: "Economics and Public Finance",
      rawSummary: longCrs,
    });

    expect(digest?.headline).toBe("Sets the federal budget through 2036");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      messages: Array<{ content: string }>;
      max_tokens: number;
    };
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}")) as {
      messages: Array<{ content: string }>;
      max_tokens: number;
    };

    expect(firstBody.messages[0]?.content).toContain("terms_explained");
    expect(firstBody.messages[0]?.content).toContain(truncateCrsSummaryForRewrite(longCrs));
    expect(secondBody.messages[0]?.content).toContain('"terms_explained": []');
    expect(secondBody.max_tokens).toBeLessThan(firstBody.max_tokens);
  });
});
