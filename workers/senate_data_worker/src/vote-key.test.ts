import { describe, expect, it } from "vitest";
import { voteKey } from "./vote-key";

describe("voteKey", () => {
  it("builds a stable composite key", () => {
    expect(
      voteKey({ chamber: "House", congress: 119, session: 2, rollNumber: 42 })
    ).toBe("House:119:2:42");
  });
});
