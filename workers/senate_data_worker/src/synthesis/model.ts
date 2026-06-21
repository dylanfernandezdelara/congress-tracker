import type { Env } from "../config";

/** Pinned fallback: highest AA intelligence_index among free models (OpenRouter catalog, 2026-06). */
export const FALLBACK_FREE_OPENROUTER_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";

interface OpenRouterModelRow {
  id: string;
  pricing?: { prompt?: string; completion?: string };
  benchmarks?: {
    artificial_analysis?: {
      intelligence_index?: number;
    };
  };
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModelRow[];
}

let cachedBestFreeModel: string | null = null;

export function isFreeOpenRouterModel(model: OpenRouterModelRow): boolean {
  return Number(model.pricing?.prompt) === 0 && Number(model.pricing?.completion) === 0;
}

export function pickBestFreeModelByIntelligenceIndex(models: OpenRouterModelRow[]): string | null {
  let best: { id: string; score: number } | null = null;

  for (const model of models) {
    if (!isFreeOpenRouterModel(model)) continue;
    const score = model.benchmarks?.artificial_analysis?.intelligence_index;
    if (score == null || Number.isNaN(score)) continue;
    if (!best || score > best.score) {
      best = { id: model.id, score };
    }
  }

  return best?.id ?? null;
}

export async function fetchBestFreeModelByIntelligenceIndex(
  apiKey: string
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter models list failed (${res.status})`);
  }

  const payload = (await res.json()) as OpenRouterModelsResponse;
  const models = payload.data ?? [];
  return pickBestFreeModelByIntelligenceIndex(models) ?? FALLBACK_FREE_OPENROUTER_MODEL;
}

export async function resolveOpenRouterModel(env: Env): Promise<string> {
  const override = env.OPENROUTER_MODEL?.split(",")[0]?.trim();
  if (override) {
    if (!override.endsWith(":free") && override !== "openrouter/free" && override !== "openrouter/owl-alpha") {
      throw new Error(
        `OPENROUTER_MODEL must be a free OpenRouter model (use :free suffix, openrouter/free, or openrouter/owl-alpha): ${override}`
      );
    }
    return override;
  }

  if (cachedBestFreeModel) return cachedBestFreeModel;

  try {
    cachedBestFreeModel = await fetchBestFreeModelByIntelligenceIndex(env.OPENROUTER_API_KEY);
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "openrouter_model_resolve_failed",
        error: err instanceof Error ? err.message : String(err),
        fallback: FALLBACK_FREE_OPENROUTER_MODEL,
      })
    );
    cachedBestFreeModel = FALLBACK_FREE_OPENROUTER_MODEL;
  }

  return cachedBestFreeModel;
}

/** Test helper — reset module cache between unit tests. */
export function resetOpenRouterModelCacheForTests(): void {
  cachedBestFreeModel = null;
}
