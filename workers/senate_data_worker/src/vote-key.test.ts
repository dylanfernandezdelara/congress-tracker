import { describe, expect, it } from "vitest";
import { parseVoteKey, voteKey } from "./vote-key";

describe("voteKey", () => {
  it("builds a stable composite key", () => {
    expect(
      voteKey({ chamber: "House", congress: 119, session: 2, rollNumber: 42 })
    ).toBe("House:119:2:42");
  });

  it("parses a valid vote key", () => {
    expect(parseVoteKey("Senate:119:2:17")).toEqual({
      chamber: "Senate",
      congress: 119,
      session: 2,
      rollNumber: 17,
    });
  });

  it("rejects malformed vote keys", () => {
    expect(parseVoteKey("bad-key")).toBeNull();
    expect(parseVoteKey("House:119:2:0")).toBeNull();
  });
});
