import { describe, expect, it } from "vitest";
import {
  isSenateVoteMenuXml,
  senateVoteMenuCacheKey,
  senateVoteMenuUrl,
} from "./senate-vote-menu";

const sample = `<?xml version="1.0"?><vote_summary>
  <congress>119</congress>
  <session>2</session>
  <votes><vote><vote_number>00217</vote_number></vote></votes>
</vote_summary>`;

describe("senate-vote-menu helpers", () => {
  it("builds url and cache key from congress/session", () => {
    expect(senateVoteMenuUrl(119, 2)).toContain("vote_menu_119_2.xml");
    expect(senateVoteMenuCacheKey(119, 2)).toBe("senate_vote_menu_cache_119_2");
  });

  it("accepts a real menu shape and optional congress/session match", () => {
    expect(isSenateVoteMenuXml(sample)).toBe(true);
    expect(isSenateVoteMenuXml(sample, { congress: 119, session: 2 })).toBe(true);
    expect(isSenateVoteMenuXml(sample, { congress: 118, session: 2 })).toBe(false);
  });

  it("rejects empty or mismatched shells", () => {
    expect(isSenateVoteMenuXml("<html>nope</html>")).toBe(false);
    expect(
      isSenateVoteMenuXml(
        "<vote_summary><congress>119</congress><session>2</session><vote></vote></vote_summary>"
      )
    ).toBe(false);
  });
});
