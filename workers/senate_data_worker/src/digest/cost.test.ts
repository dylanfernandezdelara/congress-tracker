import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config";

const mockBudgetLeft = vi.fn();
vi.mock("./budget", () => ({ budgetLeft: (...a: unknown[]) => mockBudgetLeft(...a) }));

import { BudgetShort, ensureBudget, estimateCost } from "./cost";
import { newBillModel, rewriteModel } from "./models";

const env = {} as Env;
const messages = { system: "s".repeat(4_000), user: "u".repeat(36_000) }; // 10k prompt tokens

describe("call cost estimates", () => {
  it("prices a direct Luna call at twice the batch estimate, and Sonnet at its own price", () => {
    const luna = newBillModel(env);
    // 10k in × $0.05 + 4k out × $0.25, per million.
    expect(estimateCost(luna, [messages], "batch")).toBeCloseTo(0.0015, 6);
    expect(estimateCost(luna, [messages], "direct")).toBeCloseTo(0.003, 6);
    expect(estimateCost(rewriteModel(env), [messages], "direct")).toBeCloseTo(0.06, 6);
  });

  it("throws BudgetShort with what is left and what the call needs", async () => {
    mockBudgetLeft.mockResolvedValue(0.002);
    const err = await ensureBudget(env, newBillModel(env), [messages]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BudgetShort);
    expect((err as Error).message).toBe("budget: $0.002 left, needs ~$0.003");

    mockBudgetLeft.mockResolvedValue(-0.5);
    await expect(ensureBudget(env, newBillModel(env), [messages])).rejects.toThrow("budget: $0.000 left");

    mockBudgetLeft.mockResolvedValue(0.003);
    await expect(ensureBudget(env, newBillModel(env), [messages])).resolves.toBeUndefined();
  });
});
