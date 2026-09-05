import { describe, expect, it } from "vitest";
import { buildDigestPrompt } from "./prompt";

const base = {
  title: "To designate a post office in Springfield",
  billLabel: "H.R. 10216 · 119th Congress",
  policyArea: "Government Operations and Politics",
  acronyms: [] as string[],
};

describe("buildDigestPrompt", () => {
  it("instructs a conservative title-only rewrite when CRS text is missing", () => {
    const prompt = buildDigestPrompt({ ...base, rawSummary: "" });

    expect(prompt).toContain("title-only rewrite");
    expect(prompt).toContain("not available — rewrite from the bill title and policy area only");
    expect(prompt).toContain("Do not invent CRS details");
    expect(prompt).toContain(base.title);
    expect(prompt).not.toContain("Use only facts from the summary and metadata above.");
  });

  it("prefers official CRS text when a summary is present", () => {
    const crs = "This bill designates the facility of the United States Postal Service in Springfield as the Example Post Office.";
    const prompt = buildDigestPrompt({ ...base, rawSummary: crs });

    expect(prompt).toContain(crs);
    expect(prompt).toContain("Use only facts from the summary and metadata above. Do not invent context.");
    expect(prompt).not.toContain("title-only rewrite");
  });
});
