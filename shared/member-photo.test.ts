import { describe, expect, it } from "vitest";
import {
  bioguidePhotoUrl,
  congressGovMemberUrl,
  memberInitials,
  memberNameSlug,
} from "./member-photo";

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

  it("slugs member names for congress.gov paths", () => {
    expect(memberNameSlug("Christopher A. Coons")).toBe("christopher-a-coons");
    expect(memberNameSlug("Nancy Pelosi")).toBe("nancy-pelosi");
    expect(memberNameSlug("Alexandria Ocasio-Cortez")).toBe("alexandria-ocasio-cortez");
    expect(memberNameSlug("Robert Menendez Jr.")).toBe("robert-menendez");
    expect(memberNameSlug("  ")).toBe("member");
  });

  it("builds congress.gov member urls with name slug and uppercase bioguide", () => {
    expect(congressGovMemberUrl("P000197", "Nancy Pelosi")).toBe(
      "https://www.congress.gov/member/nancy-pelosi/P000197",
    );
    expect(congressGovMemberUrl("C001088", "")).toBe(
      "https://www.congress.gov/member/member/C001088",
    );
    expect(congressGovMemberUrl("LOCAL:smith", "Local Smith")).toBeNull();
    expect(congressGovMemberUrl("LIS:12345", "Unresolved")).toBeNull();
  });

  it("derives member initials", () => {
    expect(memberInitials("Nancy Pelosi")).toBe("NP");
    expect(memberInitials("Madonna")).toBe("M");
    expect(memberInitials("  ")).toBe("?");
    expect(memberInitials("Rep. Sample Crossover (local)")).toBe("SC");
    expect(memberInitials("Foxx, Virginia")).toBe("VF");
    expect(memberInitials("Ocasio-Cortez, Alexandria")).toBe("AO");
    expect(memberInitials("Brian Fitzpatrick")).toBe("BF");
    expect(memberInitials("Sen. Bernard Sanders (local)")).toBe("BS");
    expect(memberInitials("Rep. Foxx, Virginia [R-NC-5]")).toBe("VF");
    expect(memberInitials("Cher")).toBe("C");
    expect(memberInitials("")).toBe("?");
    expect(memberInitials("Del Toro, Benicio")).toBe("BD");
    expect(memberInitials("Del. Jane Doe")).toBe("JD");
  });
});
