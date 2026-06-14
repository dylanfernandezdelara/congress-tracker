import { describe, expect, it } from "vitest";
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

describe("parseSenateMemberVoteXml", () => {
  it("parses member positions from senate roll XML", () => {
    const { members, votes } = parseSenateMemberVoteXml(SAMPLE_SENATE_MEMBER_XML, 119, 2, 1);
    expect(members).toHaveLength(2);
    expect(votes).toHaveLength(2);
    expect(members[0].bioguideId).toBe("LIS:S001");
    expect(votes[0].position).toBe("Yea");
    expect(members[1].party).toBe("R");
  });
});
