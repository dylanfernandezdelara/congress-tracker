import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSchemaFlag } from "../d1/schema";

const {
  countMemberVotesInSession,
  sumMemberSessionVotesCast,
  countMemberSessionStatsRows,
  countMemberCrossVotesInSession,
  selectDriftedSessionRolls,
  selectOrphanSessionStatsBioguides,
  selectMemberCrossVoteBioguidesForRoll,
  clearMemberSessionStatsForSession,
  replaceMemberCrossVotesForRoll,
  refreshMemberSessionStatsForBioguides,
  deleteMemberCrossVotesForRoll,
  selectMemberVotesForSession,
  selectMemberVotesForRoll,
  getMembersByIds,
  getVoteRollMeta,
} = vi.hoisted(() => ({
  countMemberVotesInSession: vi.fn(),
  sumMemberSessionVotesCast: vi.fn(),
  countMemberSessionStatsRows: vi.fn(),
  countMemberCrossVotesInSession: vi.fn(),
  selectDriftedSessionRolls: vi.fn(),
  selectOrphanSessionStatsBioguides: vi.fn(),
  selectMemberCrossVoteBioguidesForRoll: vi.fn(),
  clearMemberSessionStatsForSession: vi.fn(async () => {}),
  replaceMemberCrossVotesForRoll: vi.fn(async () => {}),
  refreshMemberSessionStatsForBioguides: vi.fn(async () => {}),
  deleteMemberCrossVotesForRoll: vi.fn(async () => {}),
  selectMemberVotesForSession: vi.fn(),
  selectMemberVotesForRoll: vi.fn(),
  getMembersByIds: vi.fn(),
  getVoteRollMeta: vi.fn(),
}));

vi.mock("../d1/member-session-stats", () => ({
  countMemberVotesInSession,
  sumMemberSessionVotesCast,
  countMemberSessionStatsRows,
  countMemberCrossVotesInSession,
  selectDriftedSessionRolls,
  selectOrphanSessionStatsBioguides,
  selectMemberCrossVoteBioguidesForRoll,
  clearMemberSessionStatsForSession,
  replaceMemberCrossVotesForRoll,
  refreshMemberSessionStatsForBioguides,
  deleteMemberCrossVotesForRoll,
}));
vi.mock("../d1/member-votes", () => ({
  selectMemberVotesForSession,
  selectMemberVotesForRoll,
}));
vi.mock("../d1/members", () => ({ getMembersByIds }));
vi.mock("../d1/votes", () => ({ getVoteRollMeta }));

import {
  applyRollToMemberSessionStats,
  memberSessionStatsOutOfSync,
  rebuildMemberSessionStats,
  reconcileMemberSessionStats,
} from "./member-session-stats";

describe("member session stats materialization", () => {
  beforeEach(() => {
    resetSchemaFlag();
    vi.clearAllMocks();
    selectOrphanSessionStatsBioguides.mockResolvedValue([]);
    selectMemberCrossVoteBioguidesForRoll.mockResolvedValue([]);
    getMembersByIds.mockResolvedValue(new Map());
  });

  describe("memberSessionStatsOutOfSync", () => {
    it("is false when there are no member votes", async () => {
      countMemberVotesInSession.mockResolvedValue(0);
      sumMemberSessionVotesCast.mockResolvedValue(0);
      expect(await memberSessionStatsOutOfSync({} as D1Database, 119, 2)).toBe(false);
    });

    it("is true when vote rows and stats tallies disagree", async () => {
      countMemberVotesInSession.mockResolvedValue(10);
      sumMemberSessionVotesCast.mockResolvedValue(0);
      expect(await memberSessionStatsOutOfSync({} as D1Database, 119, 2)).toBe(true);
    });
  });

  describe("applyRollToMemberSessionStats", () => {
    it("writes cross-vote rows and refreshes tallies for voters on the roll", async () => {
      getMembersByIds.mockResolvedValue(
        new Map([
          ["F000466", { bioguide_id: "F000466", party: "R" }],
        ])
      );

      // refresh path is mocked; we only assert replace + refresh calls
      await applyRollToMemberSessionStats(
        {} as D1Database,
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          bill_type: "hr",
          bill_number: 1,
          bill_congress: 119,
          yeas: 220,
          nays: 210,
          vote_date: "2026-07-01",
        },
        [
          { bioguideId: "F000466", position: "Yea" },
          { bioguideId: "D000001", position: "Nay" },
          { bioguideId: "R000001", position: "Nay" },
          { bioguideId: "R000002", position: "Nay" },
        ],
        new Map([
          ["F000466", "R"],
          ["D000001", "D"],
          ["R000001", "R"],
          ["R000002", "R"],
        ])
      );

      expect(replaceMemberCrossVotesForRoll).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ chamber: "House", roll_number: 10 }),
        [
          expect.objectContaining({
            bioguide_id: "F000466",
            position: "yea",
            party_line: "nay",
            margin: 10,
          }),
        ]
      );
      expect(refreshMemberSessionStatsForBioguides).toHaveBeenCalledWith(
        expect.anything(),
        119,
        2,
        expect.arrayContaining(["F000466", "D000001", "R000001", "R000002"])
      );
    });
  });

  describe("rebuildMemberSessionStats", () => {
    it("rebuilds cross votes from stored session member_votes", async () => {
      const sessionVotes = [
        {
          bioguide_id: "F000466",
          position: "Yea",
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          yeas: 220,
          nays: 210,
          bill_type: "hr",
          bill_number: 1,
          bill_congress: 119,
          vote_date: "2026-07-01",
        },
        {
          bioguide_id: "R000001",
          position: "Nay",
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          yeas: 220,
          nays: 210,
          bill_type: "hr",
          bill_number: 1,
          bill_congress: 119,
          vote_date: "2026-07-01",
        },
        {
          bioguide_id: "R000002",
          position: "Nay",
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          yeas: 220,
          nays: 210,
          bill_type: "hr",
          bill_number: 1,
          bill_congress: 119,
          vote_date: "2026-07-01",
        },
      ];
      selectMemberVotesForSession.mockImplementation(
        async (_db: D1Database, _c: number, _s: number, chamber: string) =>
          chamber === "House" ? sessionVotes : []
      );
      getMembersByIds.mockResolvedValue(
        new Map([
          ["F000466", { bioguide_id: "F000466", party: "R" }],
          ["R000001", { bioguide_id: "R000001", party: "R" }],
          ["R000002", { bioguide_id: "R000002", party: "R" }],
        ])
      );

      await rebuildMemberSessionStats({} as D1Database, 119, 2);

      expect(clearMemberSessionStatsForSession).toHaveBeenCalledWith(
        expect.anything(),
        119,
        2
      );
      expect(replaceMemberCrossVotesForRoll).toHaveBeenCalledTimes(1);
      expect(refreshMemberSessionStatsForBioguides).toHaveBeenCalled();
    });
  });

  describe("reconcileMemberSessionStats", () => {
    it("is a no-op with no writes when tallies already match", async () => {
      countMemberVotesInSession.mockResolvedValue(10);
      sumMemberSessionVotesCast.mockResolvedValue(10);

      const result = await reconcileMemberSessionStats({} as D1Database, 119, 2);

      expect(result).toEqual({
        repaired: false,
        fullRebuild: false,
        rollsRepaired: 0,
        rollsRemaining: 0,
      });
      expect(countMemberSessionStatsRows).not.toHaveBeenCalled();
      expect(selectDriftedSessionRolls).not.toHaveBeenCalled();
      expect(clearMemberSessionStatsForSession).not.toHaveBeenCalled();
      expect(replaceMemberCrossVotesForRoll).not.toHaveBeenCalled();
      expect(refreshMemberSessionStatsForBioguides).not.toHaveBeenCalled();
    });

    it("full-rebuilds when denormalized tables are empty", async () => {
      countMemberVotesInSession.mockResolvedValue(5);
      sumMemberSessionVotesCast.mockResolvedValue(0);
      countMemberSessionStatsRows.mockResolvedValue(0);
      countMemberCrossVotesInSession.mockResolvedValue(0);
      selectMemberVotesForSession.mockResolvedValue([]);

      const result = await reconcileMemberSessionStats({} as D1Database, 119, 2);

      expect(result.fullRebuild).toBe(true);
      expect(result.repaired).toBe(true);
      expect(clearMemberSessionStatsForSession).toHaveBeenCalled();
      expect(selectDriftedSessionRolls).not.toHaveBeenCalled();
    });

    it("repairs only drifted rolls and reports remaining beyond the bound", async () => {
      countMemberVotesInSession.mockResolvedValue(20);
      sumMemberSessionVotesCast.mockResolvedValue(10);
      countMemberSessionStatsRows.mockResolvedValue(3);
      countMemberCrossVotesInSession.mockResolvedValue(1);
      selectDriftedSessionRolls.mockResolvedValue([
        { chamber: "House", roll_number: 10 },
        { chamber: "House", roll_number: 11 },
        { chamber: "Senate", roll_number: 5 },
      ]);
      selectMemberVotesForRoll.mockResolvedValue([
        { bioguide_id: "A", position: "Yea" },
      ]);
      getVoteRollMeta.mockImplementation(async (_db: D1Database, roll: { roll_number: number }) => ({
        chamber: "House",
        congress: 119,
        session: 2,
        roll_number: roll.roll_number,
        bill_type: "hr",
        bill_number: 1,
        bill_congress: 119,
        yeas: 200,
        nays: 100,
        vote_date: "2026-07-01",
      }));
      getMembersByIds.mockResolvedValue(
        new Map([["A", { bioguide_id: "A", party: "D" }]])
      );

      const result = await reconcileMemberSessionStats({} as D1Database, 119, 2, 1);

      expect(result).toEqual({
        repaired: true,
        fullRebuild: false,
        rollsRepaired: 1,
        rollsRemaining: 2,
      });
      expect(clearMemberSessionStatsForSession).not.toHaveBeenCalled();
      expect(replaceMemberCrossVotesForRoll).toHaveBeenCalledTimes(1);
      expect(replaceMemberCrossVotesForRoll).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ chamber: "House", roll_number: 10 }),
        expect.any(Array)
      );
    });

    it("repairs a single drifted roll without touching others when under the bound", async () => {
      countMemberVotesInSession.mockResolvedValue(8);
      sumMemberSessionVotesCast.mockResolvedValue(4);
      countMemberSessionStatsRows.mockResolvedValue(2);
      countMemberCrossVotesInSession.mockResolvedValue(1);
      selectDriftedSessionRolls.mockResolvedValue([{ chamber: "House", roll_number: 42 }]);
      selectMemberVotesForRoll.mockResolvedValue([
        { bioguide_id: "X", position: "Nay" },
      ]);
      getVoteRollMeta.mockResolvedValue({
        chamber: "House",
        congress: 119,
        session: 2,
        roll_number: 42,
        bill_type: "hr",
        bill_number: 9,
        bill_congress: 119,
        yeas: 210,
        nays: 200,
        vote_date: "2026-07-02",
      });
      getMembersByIds.mockResolvedValue(
        new Map([["X", { bioguide_id: "X", party: "R" }]])
      );

      const result = await reconcileMemberSessionStats({} as D1Database, 119, 2, 25);

      expect(result.rollsRepaired).toBe(1);
      expect(result.rollsRemaining).toBe(0);
      expect(replaceMemberCrossVotesForRoll).toHaveBeenCalledTimes(1);
      expect(replaceMemberCrossVotesForRoll).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ roll_number: 42 }),
        expect.any(Array)
      );
    });

    it("deletes orphan cross-votes and refreshes affected bioguides", async () => {
      countMemberVotesInSession.mockResolvedValue(6);
      sumMemberSessionVotesCast.mockResolvedValue(4);
      countMemberSessionStatsRows.mockResolvedValue(2);
      countMemberCrossVotesInSession.mockResolvedValue(2);
      selectDriftedSessionRolls.mockResolvedValue([{ chamber: "Senate", roll_number: 7 }]);
      selectMemberVotesForRoll.mockResolvedValue([]);
      selectMemberCrossVoteBioguidesForRoll.mockResolvedValue(["A", "B"]);

      const result = await reconcileMemberSessionStats({} as D1Database, 119, 2, 25);

      expect(result.repaired).toBe(true);
      expect(deleteMemberCrossVotesForRoll).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ chamber: "Senate", roll_number: 7 })
      );
      expect(refreshMemberSessionStatsForBioguides).toHaveBeenCalledWith(
        expect.anything(),
        119,
        2,
        ["A", "B"]
      );
      expect(replaceMemberCrossVotesForRoll).not.toHaveBeenCalled();
    });

    it("refreshes tallies when roll meta is missing so bounded repair cannot stall", async () => {
      countMemberVotesInSession.mockResolvedValue(6);
      sumMemberSessionVotesCast.mockResolvedValue(2);
      countMemberSessionStatsRows.mockResolvedValue(1);
      countMemberCrossVotesInSession.mockResolvedValue(1);
      selectDriftedSessionRolls.mockResolvedValue([{ chamber: "House", roll_number: 3 }]);
      selectMemberVotesForRoll.mockResolvedValue([
        { bioguide_id: "Z", position: "Yea" },
      ]);
      getVoteRollMeta.mockResolvedValue(null);

      const result = await reconcileMemberSessionStats({} as D1Database, 119, 2, 25);

      expect(result.rollsRepaired).toBe(1);
      expect(deleteMemberCrossVotesForRoll).toHaveBeenCalled();
      expect(refreshMemberSessionStatsForBioguides).toHaveBeenCalledWith(
        expect.anything(),
        119,
        2,
        ["Z"]
      );
      expect(replaceMemberCrossVotesForRoll).not.toHaveBeenCalled();
    });
  });
});
