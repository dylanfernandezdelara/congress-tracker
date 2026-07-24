import { describe, expect, it } from "vitest";
import {
  isLisMemberId,
  isLocalSampleMemberId,
  isRealBioguideId,
  senateMemberLookupKey,
} from "./member-id";

describe("member id helpers", () => {
  it("detects local sample and LIS ids", () => {
    expect(isLocalSampleMemberId("LOCAL:smith")).toBe(true);
    expect(isLocalSampleMemberId("P000197")).toBe(false);
    expect(isLisMemberId("LIS:12345")).toBe(true);
    expect(isLisMemberId("P000197")).toBe(false);
  });

  it("validates bioguide ids", () => {
    expect(isRealBioguideId("P000197")).toBe(true);
    expect(isRealBioguideId("LOCAL:smith")).toBe(false);
    expect(isRealBioguideId("LIS:12345")).toBe(false);
    expect(isRealBioguideId("")).toBe(false);
  });

  it("builds senate lookup keys with normalized party", () => {
    expect(senateMemberLookupKey("Smith", "CA", "Democrat")).toBe("smith|CA|D");
    expect(senateMemberLookupKey(" Jones ", " tx ", " REP ")).toBe("jones|TX|R");
  });

  it("treats diacritic and ASCII last names as the same senate lookup key", () => {
    expect(senateMemberLookupKey("Luján", "NM", "D")).toBe("lujan|NM|D");
    expect(senateMemberLookupKey("Lujan", "NM", "D")).toBe(
      senateMemberLookupKey("Luján", "NM", "Democrat")
    );
    expect(senateMemberLookupKey("Muñoz", "TX", "R")).toBe(
      senateMemberLookupKey("Munoz", "TX", "Republican")
    );
  });
});
