import { describe, expect, it } from "vitest";
import { senateMemberLookupKey } from "../../../../shared/member-id";
import { parseSenateMemberVoteXml } from "../sources/senate-member-votes";

const SAMPLE_SENATE_MEMBER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <members>
    <member>
      <member_full>Smith, John (D-MA)</member_full>
      <first_name>John</first_name>
      <last_name>Smith</last_name>
      <party>D</party>
      <state>MA</state>
      <vote_cast>Yea</vote_cast>
      <lis_member_id>S001</lis_member_id>
    </member>
    <member>
      <member_full>Jones, Ann (R-TX)</member_full>
      <first_name>Ann</first_name>
      <last_name>Jones</last_name>
      <party>R</party>
      <state>TX</state>
      <vote_cast>Nay</vote_cast>
      <lis_member_id>S002</lis_member_id>
    </member>
  </members>
</roll_call_vote>`;

const LUJAN_SENATE_MEMBER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <members>
    <member>
      <member_full>Lujan (D-NM)</member_full>
      <first_name>Ben</first_name>
      <last_name>Lujan</last_name>
      <party>D</party>
      <state>NM</state>
      <vote_cast>Yea</vote_cast>
      <lis_member_id>S321</lis_member_id>
    </member>
  </members>
</roll_call_vote>`;

describe("parseSenateMemberVoteXml", () => {
  it("parses member positions from senate roll XML", () => {
    const { members, votes } = parseSenateMemberVoteXml(SAMPLE_SENATE_MEMBER_XML, 119, 2, 1);
    expect(members).toHaveLength(2);
    expect(votes).toHaveLength(2);
    expect(members[0].bioguideId).toBe("LIS:S001");
    expect(votes[0].position).toBe("Yea");
    expect(members[1].party).toBe("R");
  });

  it("stores First Last names instead of member_full Last (P-ST) forms", () => {
    const { members } = parseSenateMemberVoteXml(SAMPLE_SENATE_MEMBER_XML, 119, 2, 1);
    expect(members[0].name).toBe("John Smith");
    expect(members[1].name).toBe("Ann Jones");
    expect(members[0].name).not.toMatch(/\([A-Za-z]+-[A-Za-z]{2}\)/);
  });

  it("resolves LIS ids to bioguide ids when roster lookup is provided", () => {
    const lookup = new Map<string, string>([["smith|MA|D", "S000001"]]);
    const { members, votes } = parseSenateMemberVoteXml(SAMPLE_SENATE_MEMBER_XML, 119, 2, 1, {
      senateBioguideLookup: lookup,
    });
    expect(members[0].bioguideId).toBe("S000001");
    expect(votes[0].bioguideId).toBe("S000001");
    expect(members[1].bioguideId).toBe("LIS:S002");
  });

  it("resolves diacritic roster keys when vote XML uses ASCII last names", () => {
    const lookup = new Map<string, string>([
      [senateMemberLookupKey("Luján", "NM", "D"), "L000570"],
    ]);
    const { members, votes } = parseSenateMemberVoteXml(LUJAN_SENATE_MEMBER_XML, 119, 2, 1, {
      senateBioguideLookup: lookup,
    });
    expect(members[0].name).toBe("Ben Lujan");
    expect(members[0].bioguideId).toBe("L000570");
    expect(votes[0].bioguideId).toBe("L000570");
  });
});
