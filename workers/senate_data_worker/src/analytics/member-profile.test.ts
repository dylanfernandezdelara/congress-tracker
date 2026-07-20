import { describe, expect, it, vi } from "vitest";
import { buildMemberProfile } from "./member-profile";

type MockRow = Record<string, unknown>;

function createDb(options: {
  member?: MockRow | null;
  sessionVotes?: MockRow[];
  roster?: MockRow[];
}): D1Database {
  const { member = null, sessionVotes = [], roster = [] } = options;

  return {
    exec: vi.fn(async () => {}),
    prepare: vi.fn((sql: string) => {
      const bind = (..._args: unknown[]) => ({
        all: vi.fn(async () => {
          if (sql.includes("FROM member_votes mv") && sql.includes("JOIN votes v")) {
            return { results: sessionVotes };
          }
          if (sql.includes("FROM members WHERE bioguide_id IN")) {
            const ids = _args as string[];
            return {
              results: roster.filter((row) => ids.includes(String(row.bioguide_id))),
            };
          }
          return { results: [] };
        }),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ success: true, meta: { duration: 0 } })),
        bind,
      });

      return {
        bind: (...args: unknown[]) => {
          if (sql.includes("FROM members WHERE bioguide_id IN") && args.length === 1) {
            // getMember / getMembersByIds single-id path uses IN (?)
            const id = String(args[0]);
            return {
              all: vi.fn(async () => ({
                results: member && String(member.bioguide_id) === id ? [member] : [],
              })),
              first: vi.fn(async () => null),
              run: vi.fn(async () => ({ success: true, meta: { duration: 0 } })),
              bind,
            };
          }
          return bind(...args);
        },
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ success: true, meta: { duration: 0 } })),
      };
    }),
  } as unknown as D1Database;
}

describe("buildMemberProfile", () => {
  it("returns null when the member is missing", async () => {
    const profile = await buildMemberProfile(createDb({ member: null }), 119, 2, "A000001");
    expect(profile).toBeNull();
  });

  it("returns roster identity with empty vote stats when no votes exist", async () => {
    const profile = await buildMemberProfile(
      createDb({
        member: {
          bioguide_id: "F000466",
          name: "Brian Fitzpatrick",
          chamber: "House",
          party: "R",
          state: "PA",
          district: 1,
        },
      }),
      119,
      2,
      "F000466"
    );

    expect(profile).toMatchObject({
      bioguide_id: "F000466",
      name: "Brian Fitzpatrick",
      chamber: "House",
      party: "R",
      state: "PA",
      district: 1,
      votes_cast: 0,
      yea_count: 0,
      nay_count: 0,
      cross_vote_count: 0,
      cross_vote_label: "rare",
      member_votes_available: false,
      recent_cross_votes: [],
    });
    expect(profile?.photo_url).toContain("F000466");
    expect(profile?.congress_gov_url).toContain("f000466");
  });

  it("counts yea/nay and recent party-line breaks", async () => {
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
        bill_type: "HR",
        bill_number: 1,
        bill_congress: 119,
        vote_date: "2026-07-01",
      },
      {
        bioguide_id: "D000001",
        position: "Nay",
        chamber: "House",
        congress: 119,
        session: 2,
        roll_number: 10,
        yeas: 220,
        nays: 210,
        bill_type: "HR",
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
        bill_type: "HR",
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
        bill_type: "HR",
        bill_number: 1,
        bill_congress: 119,
        vote_date: "2026-07-01",
      },
    ];

    const roster = [
      {
        bioguide_id: "F000466",
        name: "Brian Fitzpatrick",
        chamber: "House",
        party: "R",
        state: "PA",
        district: 1,
      },
      {
        bioguide_id: "D000001",
        name: "Dem One",
        chamber: "House",
        party: "D",
        state: "CA",
        district: 1,
      },
      {
        bioguide_id: "R000001",
        name: "Rep One",
        chamber: "House",
        party: "R",
        state: "TX",
        district: 1,
      },
      {
        bioguide_id: "R000002",
        name: "Rep Two",
        chamber: "House",
        party: "R",
        state: "FL",
        district: 1,
      },
    ];

    const profile = await buildMemberProfile(
      createDb({
        member: roster[0],
        sessionVotes,
        roster,
      }),
      119,
      2,
      "F000466"
    );

    expect(profile).toMatchObject({
      votes_cast: 1,
      yea_count: 1,
      nay_count: 0,
      cross_vote_count: 1,
      cross_vote_label: "rare",
      member_votes_available: true,
    });
    expect(profile?.recent_cross_votes).toEqual([
      expect.objectContaining({
        roll_number: 10,
        bill_type: "HR",
        bill_number: 1,
        position: "yea",
        party_line: "nay",
        margin: 10,
      }),
    ]);
  });
});
