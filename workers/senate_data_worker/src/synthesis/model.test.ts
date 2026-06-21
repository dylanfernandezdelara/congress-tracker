import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_FREE_OPENROUTER_MODEL,
  fetchBestFreeModelByIntelligenceIndex,
  isFreeOpenRouterModel,
  pickBestFreeModelByIntelligenceIndex,
  resetOpenRouterModelCacheForTests,
  resolveOpenRouterModel,
} from "./model";

describe("openrouter model selection", () => {
  afterEach(() => {
    resetOpenRouterModelCacheForTests();
    vi.unstubAllGlobals();
  });

  it("picks the highest Artificial Analysis intelligence_index among free models", () => {
    const best = pickBestFreeModelByIntelligenceIndex([
      {
        id: "google/gemma-4-31b-it:free",
        pricing: { prompt: "0", completion: "0" },
        benchmarks: { artificial_analysis: { intelligence_index: 29.4 } },
      },
      {
        id: "nvidia/nemotron-3-ultra-550b-a55b:free",
        pricing: { prompt: "0", completion: "0" },
        benchmarks: { artificial_analysis: { intelligence_index: 37.8 } },
      },
      {
        id: "openai/gpt-4o-mini",
        pricing: { prompt: "0.00000015", completion: "0.0000006" },
        benchmarks: { artificial_analysis: { intelligence_index: 99 } },
      },
    ]);

    expect(best).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
  });

  it("ignores paid models even when they have higher scores", () => {
    expect(
      isFreeOpenRouterModel({
        id: "openai/gpt-4o-mini",
        pricing: { prompt: "0.00000015", completion: "0.0000006" },
      })
    ).toBe(false);
  });

  it("falls back when the models API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("fail", { status: 500 }))
    );

    await expect(fetchBestFreeModelByIntelligenceIndex("test-key")).rejects.toThrow(
      "OpenRouter models list failed"
    );
  });

  it("uses a free override when OPENROUTER_MODEL is set", async () => {
    const model = await resolveOpenRouterModel({
      OPENROUTER_API_KEY: "test-key",
      OPENROUTER_MODEL: "google/gemma-4-31b-it:free",
    } as any);

    expect(model).toBe("google/gemma-4-31b-it:free");
  });

  it("rejects paid OPENROUTER_MODEL overrides", async () => {
    await expect(
      resolveOpenRouterModel({
        OPENROUTER_API_KEY: "test-key",
        OPENROUTER_MODEL: "openai/gpt-4o-mini",
      } as any)
    ).rejects.toThrow("OPENROUTER_MODEL must be a free OpenRouter model");
  });

  it("falls back to the pinned model when no AA scores are available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              id: "openrouter/free",
              pricing: { prompt: "0", completion: "0" },
            },
          ],
        })
      )
    );

    await expect(resolveOpenRouterModel({ OPENROUTER_API_KEY: "test-key" } as any)).resolves.toBe(
      FALLBACK_FREE_OPENROUTER_MODEL
    );
  });
});
