import { describe, expect, it } from "vitest";
import { buildImportanceReasonsJson, significanceToScore } from "./significance-score";

describe("significanceToScore", () => {
  it("maps significance levels to stable integer scores", () => {
    expect(significanceToScore("high")).toBe(80);
    expect(significanceToScore("medium")).toBe(50);
    expect(significanceToScore("low")).toBe(20);
  });
});

describe("buildImportanceReasonsJson", () => {
  it("includes level and optional model reason", () => {
    expect(buildImportanceReasonsJson("high")).toBe(JSON.stringify(["high"]));
    expect(buildImportanceReasonsJson("medium", "  Budget impact  ")).toBe(
      JSON.stringify(["medium", "Budget impact"])
    );
  });
});
