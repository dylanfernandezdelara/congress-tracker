import { beforeEach, describe, expect, it } from "vitest";
import { resetSchemaFlag } from "./schema";
import {
  selectPresentedPendingLifecycleBills,
  selectRecentlyEnactedBills,
} from "./lifecycle";

type LifecycleFixture = {
  congress: number;
  bill_type: string;
  bill_number: number;
  presented_date: string | null;
  signed_date: string | null;
  vetoed_date: string | null;
  became_law_date: string | null;
  law_kind: string | null;
  public_law: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
};

type DigestFixture = {
  congress: number;
  bill_type: string;
  number: number;
  title: string | null;
  policy_area: string | null;
  digest_json: string | null;
};

type VoteFixture = {
  bill_congress: number;
  bill_type: string;
  bill_number: number;
  vote_date: string;
  is_passage: number;
};

function createLifecycleQueryDb(opts: {
  lifecycles: LifecycleFixture[];
  digests?: DigestFixture[];
  votes?: VoteFixture[];
}): D1Database {
  const digests = opts.digests ?? [];
  const votes = opts.votes ?? [];

  function latestPassageVoteDate(row: LifecycleFixture): string | null {
    const dates = votes
      .filter(
        (v) =>
          v.is_passage === 1 &&
          v.bill_congress === row.congress &&
          v.bill_type.toUpperCase() === row.bill_type.toUpperCase() &&
          v.bill_number === row.bill_number
      )
      .map((v) => v.vote_date)
      .sort((a, b) => b.localeCompare(a));
    return dates[0] ?? null;
  }

  function presentedPendingResults(congress: number, limit: number) {
    return opts.lifecycles
      .filter((row) => row.congress === congress)
      .filter((row) => row.presented_date != null)
      .filter(
        (row) =>
          row.became_law_date == null ||
          (row.law_kind === "law_unsigned" && (row.public_law == null || row.public_law === ""))
      )
      .sort((a, b) => {
        const byPresented = (a.presented_date ?? "").localeCompare(b.presented_date ?? "");
        if (byPresented !== 0) return byPresented;
        return (a.latest_action_date ?? "").localeCompare(b.latest_action_date ?? "");
      })
      .slice(0, limit)
      .map((row) => ({
        bill_congress: row.congress,
        bill_type: row.bill_type,
        bill_number: row.bill_number,
      }));
  }

  function enactedResults(congress: number, limit: number, dedupeDigests: boolean) {
    return opts.lifecycles
      .filter((row) => row.congress === congress)
      .filter((row) => row.became_law_date != null)
      .filter(
        (row) => row.law_kind == null || (row.law_kind !== "vetoed" && row.law_kind !== "pocket_vetoed")
      )
      .flatMap((row) => {
        const matches = digests.filter(
          (d) =>
            d.congress === row.congress &&
            d.bill_type.toUpperCase() === row.bill_type.toUpperCase() &&
            d.number === row.bill_number
        );
        const preferred = matches.find((d) => d.title && !d.title.includes("(local sample)"));
        const joined = dedupeDigests ? [preferred ?? matches[0]].filter(Boolean) : matches;
        const digestRows = joined.length > 0 ? joined : [null];
        return digestRows.map((digest) => {
          let headline: string | null = null;
          if (digest?.digest_json) {
            try {
              const parsed = JSON.parse(digest.digest_json) as { headline?: string };
              headline = parsed.headline ?? null;
            } catch {
              headline = null;
            }
          }
          return {
            congress: row.congress,
            bill_type: row.bill_type,
            bill_number: row.bill_number,
            title: digest?.title ?? null,
            policy_area: digest?.policy_area ?? null,
            headline,
            became_law_date: row.became_law_date,
            law_kind: row.law_kind,
            public_law: row.public_law,
            signed_date: row.signed_date,
            presented_date: row.presented_date,
            latest_action_date: row.latest_action_date,
            latest_action_text: row.latest_action_text,
            latest_passage_vote_date: latestPassageVoteDate(row),
          };
        });
      })
      .sort((a, b) => {
        const byLaw = (b.became_law_date ?? "").localeCompare(a.became_law_date ?? "");
        if (byLaw !== 0) return byLaw;
        return (b.latest_action_date ?? "").localeCompare(a.latest_action_date ?? "");
      })
      .slice(0, limit);
  }

  const stmt = (sql: string) => {
    const isEnacted = sql.includes("FROM bill_lifecycle l") && sql.includes("became_law_date IS NOT NULL");
    const digestDeduped =
      sql.includes("GROUP BY congress, UPPER(bill_type), number") &&
      sql.includes("local sample");
    const isPresented =
      sql.includes("FROM bill_lifecycle") &&
      sql.includes("presented_date IS NOT NULL") &&
      sql.includes("congress = ?");

    return {
      bind: (...args: unknown[]) => ({
        all: async () => {
          if (isEnacted) {
            return {
              results: enactedResults(args[0] as number, args[1] as number, digestDeduped),
            };
          }
          if (isPresented) {
            return { results: presentedPendingResults(args[0] as number, args[1] as number) };
          }
          return { results: [] };
        },
        first: async () => null,
        run: async () => ({ success: true }),
      }),
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ success: true }),
    };
  };

  return {
    prepare: (sql: string) => stmt(sql),
    exec: async () => ({}),
  } as unknown as D1Database;
}

describe("selectRecentlyEnactedBills", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("orders by became_law_date desc, respects limit, joins digest fields, and excludes non-enacted and vetoed", async () => {
    const db = createLifecycleQueryDb({
      lifecycles: [
        {
          congress: 119,
          bill_type: "HR",
          bill_number: 100,
          presented_date: "2026-06-01",
          signed_date: "2026-06-10",
          vetoed_date: null,
          became_law_date: "2026-06-10",
          law_kind: "signed",
          public_law: "119-10",
          latest_action_date: "2026-06-10",
          latest_action_text: "Became Public Law No: 119-10.",
        },
        {
          congress: 119,
          bill_type: "S",
          bill_number: 50,
          presented_date: "2026-07-01",
          signed_date: "2026-07-15",
          vetoed_date: null,
          became_law_date: "2026-07-15",
          law_kind: "signed",
          public_law: "119-20",
          latest_action_date: "2026-07-15",
          latest_action_text: "Became Public Law No: 119-20.",
        },
        {
          congress: 119,
          bill_type: "HR",
          bill_number: 200,
          presented_date: "2026-05-01",
          signed_date: null,
          vetoed_date: null,
          became_law_date: null,
          law_kind: null,
          public_law: null,
          latest_action_date: "2026-05-01",
          latest_action_text: "Presented to President.",
        },
        {
          congress: 119,
          bill_type: "S",
          bill_number: 99,
          presented_date: "2026-04-01",
          signed_date: null,
          vetoed_date: "2026-04-20",
          became_law_date: "2026-04-20",
          law_kind: "vetoed",
          public_law: null,
          latest_action_date: "2026-04-20",
          latest_action_text: "Vetoed by President.",
        },
        {
          congress: 118,
          bill_type: "HR",
          bill_number: 1,
          presented_date: "2024-01-01",
          signed_date: "2024-01-10",
          vetoed_date: null,
          became_law_date: "2024-01-10",
          law_kind: "signed",
          public_law: "118-1",
          latest_action_date: "2024-01-10",
          latest_action_text: "Became Public Law No: 118-1.",
        },
      ],
      digests: [
        {
          congress: 119,
          bill_type: "S",
          number: 50,
          title: "Housing Act",
          policy_area: "Housing",
          digest_json: JSON.stringify({
            headline: "Expands rental assistance",
            what_it_does: "Helps renters.",
            key_points: [],
            terms_explained: [],
          }),
        },
        {
          congress: 119,
          bill_type: "HR",
          number: 100,
          title: "Water Bill",
          policy_area: "Environment",
          digest_json: JSON.stringify({
            headline: "Funds clean water projects",
            what_it_does: "Pays for pipes.",
            key_points: [],
            terms_explained: [],
          }),
        },
      ],
      votes: [
        {
          bill_congress: 119,
          bill_type: "S",
          bill_number: 50,
          vote_date: "2026-06-20",
          is_passage: 1,
        },
        {
          bill_congress: 119,
          bill_type: "S",
          bill_number: 50,
          vote_date: "2026-07-01",
          is_passage: 1,
        },
        {
          bill_congress: 119,
          bill_type: "S",
          bill_number: 50,
          vote_date: "2026-07-02",
          is_passage: 0,
        },
      ],
    });

    const rows = await selectRecentlyEnactedBills(db, 119, 1);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      congress: 119,
      bill_type: "S",
      bill_number: 50,
      title: "Housing Act",
      policy_area: "Housing",
      headline: "Expands rental assistance",
      became_law_date: "2026-07-15",
      law_kind: "signed",
      public_law: "119-20",
      latest_passage_vote_date: "2026-07-01",
      item: null,
    });

    const all = await selectRecentlyEnactedBills(db, 119, 10);
    expect(all.map((r) => r.bill_number)).toEqual([50, 100]);
    expect(all.every((r) => r.law_kind !== "vetoed")).toBe(true);
    expect(all.every((r) => r.became_law_date != null)).toBe(true);
    expect(all.every((r) => r.item === null)).toBe(true);
    expect(all.find((r) => r.bill_number === 100)?.latest_passage_vote_date).toBeNull();
  });

  it("does not duplicate a law when digest rows differ only by bill_type case", async () => {
    const db = createLifecycleQueryDb({
      lifecycles: [
        {
          congress: 119,
          bill_type: "HR",
          bill_number: 6644,
          presented_date: "2026-06-29",
          signed_date: null,
          vetoed_date: null,
          became_law_date: "2026-07-11",
          law_kind: "law_unsigned",
          public_law: "119-101",
          latest_action_date: "2026-07-11",
          latest_action_text: "Became Public Law No: 119-101.",
        },
      ],
      digests: [
        {
          congress: 119,
          bill_type: "HR",
          number: 6644,
          title: "21st Century ROAD to Housing Act",
          policy_area: "Housing",
          digest_json: null,
        },
        {
          congress: 119,
          bill_type: "hr",
          number: 6644,
          title: "21st Century ROAD to Housing Act (local sample)",
          policy_area: "Housing",
          digest_json: null,
        },
      ],
    });

    const rows = await selectRecentlyEnactedBills(db, 119, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.bill_number).toBe(6644);
  });
});

describe("selectPresentedPendingLifecycleBills", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("returns presented non-terminal rows for the congress, respects limit, and skips terminal enactment", async () => {
    const db = createLifecycleQueryDb({
      lifecycles: [
        {
          congress: 119,
          bill_type: "HR",
          bill_number: 6644,
          presented_date: "2026-01-01",
          signed_date: null,
          vetoed_date: null,
          became_law_date: null,
          law_kind: null,
          public_law: null,
          latest_action_date: "2026-01-01",
          latest_action_text: "Presented to President.",
        },
        {
          congress: 119,
          bill_type: "S",
          bill_number: 9,
          presented_date: "2026-01-15",
          signed_date: null,
          vetoed_date: null,
          became_law_date: null,
          law_kind: null,
          public_law: null,
          latest_action_date: "2026-01-15",
          latest_action_text: "Presented to President.",
        },
        {
          congress: 119,
          bill_type: "S",
          bill_number: 1,
          presented_date: "2026-02-01",
          signed_date: "2026-02-10",
          vetoed_date: null,
          became_law_date: "2026-02-10",
          law_kind: "signed",
          public_law: "119-1",
          latest_action_date: "2026-02-10",
          latest_action_text: "Became Public Law No: 119-1.",
        },
        {
          congress: 119,
          bill_type: "HR",
          bill_number: 2,
          presented_date: null,
          signed_date: null,
          vetoed_date: null,
          became_law_date: null,
          law_kind: null,
          public_law: null,
          latest_action_date: null,
          latest_action_text: null,
        },
        {
          congress: 118,
          bill_type: "HR",
          bill_number: 99,
          presented_date: "2024-01-01",
          signed_date: null,
          vetoed_date: null,
          became_law_date: null,
          law_kind: null,
          public_law: null,
          latest_action_date: "2024-01-01",
          latest_action_text: "Presented to President.",
        },
      ],
    });

    const rows = await selectPresentedPendingLifecycleBills(db, 119, 50);
    expect(rows).toEqual([
      { bill_congress: 119, bill_type: "HR", bill_number: 6644 },
      { bill_congress: 119, bill_type: "S", bill_number: 9 },
    ]);

    const capped = await selectPresentedPendingLifecycleBills(db, 119, 1);
    expect(capped).toEqual([{ bill_congress: 119, bill_type: "HR", bill_number: 6644 }]);

    const otherCongress = await selectPresentedPendingLifecycleBills(db, 118, 50);
    expect(otherCongress).toEqual([{ bill_congress: 118, bill_type: "HR", bill_number: 99 }]);
  });
});
