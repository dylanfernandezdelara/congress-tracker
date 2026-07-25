import { describe, expect, it, vi } from "vitest";
import { senateMemberLookupKey } from "../../../../shared/member-id";
import {
  buildSenateBioguideLookup,
  getMembersByIds,
  senateLastNameCandidates,
} from "./members";
import { resetSchemaFlag } from "./schema";

/**
 * Records bound-parameter counts per member lookup so we can assert no single
 * query exceeds D1's 100-bound-parameter limit.
 */
function createRecordingDb(boundCounts: number[]): D1Database {
  const runResult = { success: true, meta: { duration: 0 } };
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => {
        if (sql.includes("FROM members WHERE bioguide_id IN")) {
          boundCounts.push(args.length);
        }
        return {
          all: async () => ({
            results: args.map((id) => ({
              bioguide_id: id as string,
              name: `Member ${id}`,
              chamber: "House",
              party: "D",
              state: "CA",
              district: 1,
            })),
          }),
          run: async () => runResult,
        };
      },
      run: async () => runResult,
    }),
  } as unknown as D1Database;
}

type SenateLookupRow = {
  bioguide_id: string;
  name: string;
  party: string;
  state: string;
};

/** Incomplete roster + empty pipeline cache so lookup rebuilds from the given Senate rows. */
function createSenateLookupDb(senateRows: SenateLookupRow[]): D1Database {
  const runResult = { success: true, meta: { duration: 0 } };
  return {
    exec: vi.fn(async () => {}),
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        all: async () => {
          if (sql.includes("COUNT(*)") && sql.includes("FROM members")) {
            return { results: [] };
          }
          if (sql.includes("chamber = 'Senate'") && sql.includes("FROM members")) {
            return { results: senateRows };
          }
          return { results: [] };
        },
        first: async () => null,
        run: async () => runResult,
      }),
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => runResult,
    }),
  } as unknown as D1Database;
}

describe("getMembersByIds", () => {
  it("chunks lookups so no query exceeds the 100-bound-parameter limit", async () => {
    resetSchemaFlag();
    const boundCounts: number[] = [];
    const db = createRecordingDb(boundCounts);
    const ids = Array.from({ length: 435 }, (_, i) => `H${i}`);

    const map = await getMembersByIds(db, ids);

    expect(map.size).toBe(435);
    expect(boundCounts.length).toBeGreaterThan(1);
    for (const count of boundCounts) {
      expect(count).toBeLessThanOrEqual(100);
    }
  });
});

describe("senateLastNameCandidates", () => {
  it("strips party-state suffixes and handles comma-inverted names", () => {
    expect(senateLastNameCandidates("Booker (D-NJ)")).toEqual(["Booker"]);
    expect(senateLastNameCandidates("Murkowski, Lisa")).toContain("Murkowski");
    expect(senateLastNameCandidates("Ben Ray Luján")).toEqual(["Luján", "Ray Luján"]);
  });

  it("finds the surname when a generational suffix sits mid-name", () => {
    // Congress.gov "King, Angus S., Jr." is stored as this display name.
    expect(senateLastNameCandidates("Angus S., Jr. King")).toEqual(["King"]);
    expect(senateLastNameCandidates("John D., IV Rockefeller")).toEqual(["Rockefeller"]);
  });

  it("finds the surname when a generational suffix trails the name", () => {
    expect(senateLastNameCandidates("Angus S. King, Jr.")).toEqual(["King", "S. King"]);
    expect(senateLastNameCandidates("King, Angus S., Jr.")).toEqual(["King"]);
    expect(senateLastNameCandidates("Angus S. King Jr.")).toEqual(["King", "S. King"]);
  });

  it("never offers a given name as a surname candidate", () => {
    // A given-name key could collide with another senator's surname and
    // misattribute their roll-call votes.
    expect(senateLastNameCandidates("Murkowski, Lisa")).not.toContain("Lisa");
    expect(senateLastNameCandidates("Van Hollen, Chris")).toEqual(["Van Hollen"]);
    expect(senateLastNameCandidates("Angus S., Jr. King")).not.toContain("Angus S.");
  });
});

describe("buildSenateBioguideLookup", () => {
  it("resolves vote XML last names from clobbered, comma, and diacritic roster names", async () => {
    resetSchemaFlag();
    const db = createSenateLookupDb([
      { bioguide_id: "B001288", name: "Booker (D-NJ)", party: "D", state: "NJ" },
      { bioguide_id: "M001153", name: "Murkowski, Lisa", party: "R", state: "AK" },
      { bioguide_id: "L000570", name: "Ben Ray Luján", party: "D", state: "NM" },
      { bioguide_id: "K000383", name: "Angus S., Jr. King", party: "I", state: "ME" },
    ]);

    const lookup = await buildSenateBioguideLookup(db);

    expect(lookup.get(senateMemberLookupKey("Booker", "NJ", "D"))).toBe("B001288");
    expect(lookup.get(senateMemberLookupKey("Murkowski", "AK", "R"))).toBe("M001153");
    expect(lookup.get(senateMemberLookupKey("Lujan", "NM", "D"))).toBe("L000570");
    expect(lookup.get(senateMemberLookupKey("Luján", "NM", "D"))).toBe("L000570");
    expect(lookup.get(senateMemberLookupKey("King", "ME", "I"))).toBe("K000383");
  });

  it("drops keys two same-state senators of one party both answer to", async () => {
    resetSchemaFlag();
    const db = createSenateLookupDb([
      { bioguide_id: "S000001", name: "Pat Smith", party: "D", state: "CA" },
      { bioguide_id: "S000002", name: "Alex Smith", party: "D", state: "CA" },
    ]);

    const lookup = await buildSenateBioguideLookup(db);

    expect(lookup.has(senateMemberLookupKey("Smith", "CA", "D"))).toBe(false);
    expect(lookup.get(senateMemberLookupKey("Pat Smith", "CA", "D"))).toBe("S000001");
    expect(lookup.get(senateMemberLookupKey("Alex Smith", "CA", "D"))).toBe("S000002");
  });
});
