import { describe, expect, it } from "vitest";
import { parseNotableVoteJson } from "./notable-vote";

describe("parseNotableVoteJson", () => {
  it("parses fenced JSON blurbs", () => {
    const result = parseNotableVoteJson(
      '```json\n{"why_it_matters":"A narrow bipartisan win on defense funding shook party lines."}\n```'
    );
    expect(result?.why_it_matters).toContain("bipartisan win");
  });

  it("rejects blurbs that are too short", () => {
    expect(parseNotableVoteJson('{"why_it_matters":"Too short"}')).toBeNull();
  });
});
