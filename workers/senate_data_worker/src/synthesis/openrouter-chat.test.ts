import { afterEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../config";
import {
  completeWithReasoningFallback,
  fetchOpenRouterChatContent,
} from "./openrouter-chat";

describe("openrouter-chat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const env = { OPENROUTER_API_KEY: "test-key" } as Env;

  it("fetchOpenRouterChatContent returns message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
          { status: 200 }
        )
      )
    );

    const content = await fetchOpenRouterChatContent(env, {
      model: "openrouter/free",
      prompt: "hi",
      maxTokens: 128,
      disableReasoning: true,
    });
    expect(content).toBe('{"ok":true}');
  });

  it("completeWithReasoningFallback retries after a failed first attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"vote_context": "ok"}' } }],
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const parsed = await completeWithReasoningFallback(
      env,
      "openrouter/free",
      "prompt",
      (content) => {
        const match = content.match(/"vote_context":\s*"([^"]*)"/);
        return match ? match[1] : null;
      }
    );

    expect(parsed).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    ) as { reasoning?: { enabled?: boolean } };
    expect(firstBody.reasoning).toEqual({ enabled: false });
  });
});
