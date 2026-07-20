import { describe, expect, it } from "vitest";
import { bioguidePhotoUrl, congressGovMemberUrl, memberInitials } from "./member-photo";

describe("member photo helpers", () => {
  it("builds bioguide photo urls for valid ids", () => {
    expect(bioguidePhotoUrl("P000197")).toBe(
      "https://bioguide.congress.gov/bioguide/photo/p/P000197.jpg",
    );
  });

  it("returns null for non-bioguide ids", () => {
    expect(bioguidePhotoUrl("LOCAL:smith")).toBeNull();
    expect(bioguidePhotoUrl("LIS:12345")).toBeNull();
    expect(bioguidePhotoUrl("")).toBeNull();
  });

  it("builds congress.gov member urls for valid ids only", () => {
    expect(congressGovMemberUrl("P000197")).toBe("https://www.congress.gov/member/p000197");
    expect(congressGovMemberUrl("LOCAL:smith")).toBeNull();
    expect(congressGovMemberUrl("LIS:12345")).toBeNull();
  });

  it("derives member initials", () => {
    expect(memberInitials("Nancy Pelosi")).toBe("NP");
    expect(memberInitials("Madonna")).toBe("M");
    expect(memberInitials("  ")).toBe("?");
  });
});
