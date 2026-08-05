import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../config";
import {
  parseConfirmationBackgroundJson,
  rewriteConfirmationBackground,
} from "./confirmation-rewrite";

const VALID_JSON = JSON.stringify({
  headline: "Erica Schwartz confirmed as CDC Director",
  what_was_confirmed:
    "The Senate confirmed Erica Schwartz as Director of the Centers for Disease Control and Prevention.",
  background:
    "Erica Schwartz of Florida was confirmed as Director of the Centers for Disease Control and Prevention.",
  key_points: [],
});

describe("parseConfirmationBackgroundJson", () => {
  it("parses plain JSON output", () => {
    const parsed = parseConfirmationBackgroundJson(VALID_JSON);
    expect(parsed?.headline).toBe("Erica Schwartz confirmed as CDC Director");
  });

  it("parses fenced JSON output", () => {
    const parsed = parseConfirmationBackgroundJson(
      "```json\n" + VALID_JSON + "\n```"
    );
    expect(parsed?.headline).toBe("Erica Schwartz confirmed as CDC Director");
  });

  it("extracts trailing JSON after an inline reasoning preamble", () => {
    const reasoningStyle = `The user wants me to rewrite a Senate nomination record. I need to output ONLY valid JSON with fields {headline, what_was_confirmed, background, key_points}. Let me draft it.

${VALID_JSON}`;
    const parsed = parseConfirmationBackgroundJson(reasoningStyle);
    expect(parsed?.headline).toBe("Erica Schwartz confirmed as CDC Director");
    expect(parsed?.background).toContain("Erica Schwartz of Florida");
  });

  it("returns null for reasoning cut off before any JSON answer", () => {
    const cutOff =
      "The user wants me to rewrite a Senate nomination record for everyday readers. The rules say the JSON object must contain a headline naming the person";
    expect(parseConfirmationBackgroundJson(cutOff)).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(
      parseConfirmationBackgroundJson(
        JSON.stringify({ headline: "Only a headline" })
      )
    ).toBeNull();
  });
});

describe("rewriteConfirmationBackground", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const params = {
    citation: "PN932",
    description:
      "Erica Schwartz, of Florida, to be Director of the Centers for Disease Control and Prevention, vice Susan Monarez.",
    positionTitle:
      "Director of the Centers for Disease Control and Prevention",
    organization: "Department of Health and Human Services",
    rawBackground:
      "Erica Schwartz, of Florida, to be Director of the Centers for Disease Control and Prevention, vice Susan Monarez.",
  };
  const env = { OPENROUTER_API_KEY: "test-key" } as Env;

  it("asks with reasoning disabled first and returns the parsed background", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: VALID_JSON } }] }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const background = await rewriteConfirmationBackground(
      env,
      params,
      "openrouter/free"
    );

    expect(background?.headline).toBe(
      "Erica Schwartz confirmed as CDC Director"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      reasoning?: { enabled?: boolean };
      max_tokens: number;
    };
    expect(body.reasoning).toEqual({ enabled: false });
  });

  it("retries with a larger reasoning budget when the first attempt is cut off", async () => {
    const cutOffReasoning =
      "The user wants me to rewrite a Senate nomination record for everyday readers. I need to output ONLY valid JSON";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: cutOffReasoning } }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: VALID_JSON } }] }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const background = await rewriteConfirmationBackground(
      env,
      params,
      "openrouter/free"
    );

    expect(background?.headline).toBe(
      "Erica Schwartz confirmed as CDC Director"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}")) as {
      reasoning?: { enabled?: boolean };
      max_tokens: number;
    };
    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}")) as {
      reasoning?: { enabled?: boolean };
      max_tokens: number;
    };
    expect(first.reasoning).toEqual({ enabled: false });
    expect(second.reasoning).toBeUndefined();
    expect(second.max_tokens).toBeGreaterThan(first.max_tokens);
  });

  it("returns null when both attempts fail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const background = await rewriteConfirmationBackground(
      env,
      params,
      "openrouter/free"
    );

    expect(background).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
