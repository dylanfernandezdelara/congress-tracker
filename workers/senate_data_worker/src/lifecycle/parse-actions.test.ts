import { describe, expect, it } from "vitest";
import {
  isTerminalLifecycle,
  parseLifecycleActions,
  type CongressAction,
} from "./parse-actions";

describe("parseLifecycleActions", () => {
  it("parses presented (28000), signed (29000), and public law number", () => {
    const actions: CongressAction[] = [
      {
        actionCode: "28000",
        actionDate: "2026-06-29",
        text: "Presented to President.",
        type: "President",
      },
      {
        actionCode: "29000",
        actionDate: "2026-07-02",
        text: "Signed by President.",
        type: "President",
      },
      {
        actionCode: "36000",
        actionDate: "2026-07-02",
        text: "Became Public Law No: 119-123.",
        type: "President",
      },
    ];

    expect(parseLifecycleActions(actions)).toMatchObject({
      presented_date: "2026-06-29",
      signed_date: "2026-07-02",
      became_law_date: "2026-07-02",
      law_kind: "signed",
      public_law: "119-123",
      latest_action_date: "2026-07-02",
    });
  });

  it("parses veto (31000) and pocket veto (30000) codes per the LOC table", () => {
    expect(
      parseLifecycleActions([
        {
          actionCode: "31000",
          actionDate: "2026-05-01",
          text: "Vetoed by President.",
        },
      ]).law_kind
    ).toBe("vetoed");

    expect(
      parseLifecycleActions([
        {
          actionCode: "30000",
          actionDate: "2026-05-01",
          text: "Pocket vetoed by President.",
        },
      ])
    ).toMatchObject({
      vetoed_date: "2026-05-01",
      law_kind: "pocket_vetoed",
    });
  });

  it("keeps law_unsigned when generic Became Public Law (36000) accompanies 38000", () => {
    const result = parseLifecycleActions([
      {
        actionCode: "28000",
        actionDate: "2026-06-29",
        text: "Presented to President.",
        type: "President",
      },
      {
        actionCode: "38000",
        actionDate: "2026-07-11",
        text: "Public Law unsigned by President.",
        type: "President",
      },
      {
        actionCode: "36000",
        actionDate: "2026-07-11",
        text: "Became Public Law No: 119-101.",
        type: "President",
      },
    ]);

    expect(result).toMatchObject({
      became_law_date: "2026-07-11",
      law_kind: "law_unsigned",
      public_law: "119-101",
      signed_date: null,
    });
  });

  it("treats enactment over veto (39000) as enacted_over_veto", () => {
    const result = parseLifecycleActions([
      {
        actionCode: "31000",
        actionDate: "2026-05-01",
        text: "Vetoed by President.",
      },
      {
        actionCode: "39000",
        actionDate: "2026-05-20",
        text: "Public Law enacted over veto.",
      },
    ]);

    expect(result.became_law_date).toBe("2026-05-20");
    expect(result.vetoed_date).toBe("2026-05-01");
    expect(result.law_kind).toBe("enacted_over_veto");
  });

  it("parses 38000 became-law-without-signature", () => {
    const result = parseLifecycleActions([
      {
        actionCode: "28000",
        actionDate: "2026-06-29",
        text: "Presented to President.",
        type: "President",
      },
      {
        actionCode: "38000",
        actionDate: "2026-07-11",
        text: "Became Public Law No: 119-200 without signature.",
        type: "President",
      },
    ]);

    expect(result).toMatchObject({
      presented_date: "2026-06-29",
      became_law_date: "2026-07-11",
      law_kind: "law_unsigned",
      public_law: "119-200",
      signed_date: null,
    });
  });

  it("treats Sent to Archivist unsigned as law_unsigned enactment", () => {
    const result = parseLifecycleActions([
      {
        actionCode: "28000",
        actionDate: "2026-06-29",
        text: "Presented to President.",
        type: "President",
      },
      {
        actionCode: "E30000",
        actionDate: "2026-07-11",
        text: "Sent to Archivist of the United States unsigned.",
        type: "President",
      },
    ]);

    expect(result).toMatchObject({
      presented_date: "2026-06-29",
      became_law_date: "2026-07-11",
      law_kind: "law_unsigned",
      signed_date: null,
    });
  });

  it("falls back to text when actionCode is null", () => {
    const result = parseLifecycleActions([
      {
        actionCode: null,
        actionDate: "2026-06-29",
        text: "Presented to President.",
        type: "President",
      },
      {
        actionCode: null,
        actionDate: "2026-07-01",
        text: "Signed by President.",
      },
      {
        actionCode: null,
        actionDate: "2026-07-01",
        text: "Became Public Law No: 119-55.",
      },
    ]);

    expect(result).toMatchObject({
      presented_date: "2026-06-29",
      signed_date: "2026-07-01",
      public_law: "119-55",
      law_kind: "signed",
    });
  });

  it("leaves law_kind null for plain Became Public Law text with no signature or lapse evidence", () => {
    const result = parseLifecycleActions([
      {
        actionCode: null,
        actionDate: "2026-07-11",
        text: "Became Public Law No: 119-88.",
      },
    ]);

    expect(result).toMatchObject({
      became_law_date: "2026-07-11",
      law_kind: null,
      public_law: "119-88",
      signed_date: null,
    });
  });

  it("keeps latest action text/date for HR 6644-style lag (presented only)", () => {
    const result = parseLifecycleActions([
      {
        actionCode: "10000",
        actionDate: "2025-12-11",
        text: "Introduced in House",
      },
      {
        actionCode: "28000",
        actionDate: "2026-06-29",
        text: "Presented to President.",
        type: "President",
      },
    ]);

    expect(result).toEqual({
      presented_date: "2026-06-29",
      signed_date: null,
      vetoed_date: null,
      became_law_date: null,
      law_kind: null,
      public_law: null,
      latest_action_date: "2026-06-29",
      latest_action_text: "Presented to President.",
      unrecognized: [],
    });
  });

  it("matches vetoed via text and detects pocket veto wording", () => {
    expect(
      parseLifecycleActions([
        { actionDate: "2026-01-10", text: "Vetoed by President." },
      ]).law_kind
    ).toBe("vetoed");

    expect(
      parseLifecycleActions([
        { actionDate: "2026-01-10", text: "Pocket Vetoed by President." },
      ]).law_kind
    ).toBe("pocket_vetoed");
  });
});

// Real Congress.gov action lists (newest first, as the API returns them), trimmed to the presidential steps.
describe("parseLifecycleActions on real Congress.gov actions", () => {
  it("H.R. 5334 (119th): signed, though the House system codes the signature E30000 and the Library 36000", () => {
    const actions: CongressAction[] = [
      { actionDate: "2026-09-18", actionCode: "E40000", text: "Became Public Law No: 119-111." },
      { actionDate: "2026-09-18", actionCode: "36000", text: "Became Public Law No: 119-111." },
      { actionDate: "2026-09-18", actionCode: "E30000", text: "Signed by President." },
      { actionDate: "2026-09-18", actionCode: "36000", text: "Signed by President." },
      { actionDate: "2026-09-17", actionCode: "E20000", text: "Presented to President." },
      { actionDate: "2026-09-17", actionCode: "28000", text: "Presented to President." },
      {
        actionDate: "2026-09-16",
        actionCode: "H41610",
        text: "On motion that the House agree to the Senate amendments Agreed to by the Yeas and Nays: 262 - 159 (Roll no. 301).",
      },
    ];

    expect(parseLifecycleActions(actions, [{ number: "119-111", type: "Public Law" }])).toMatchObject({
      presented_date: "2026-09-17",
      signed_date: "2026-09-18",
      became_law_date: "2026-09-18",
      law_kind: "signed",
      public_law: "119-111",
      unrecognized: [],
    });
  });

  it("S. 629 (119th): became law unsigned after the ten days", () => {
    const actions: CongressAction[] = [
      { actionDate: "2026-07-12", actionCode: "E30000", text: "Sent to Archivist of the United States unsigned." },
      { actionDate: "2026-06-30", actionCode: "28000", text: "Presented to President." },
    ];

    expect(parseLifecycleActions(actions, [{ number: "119-102", type: "Public Law" }])).toMatchObject({
      became_law_date: "2026-07-12",
      law_kind: "law_unsigned",
      public_law: "119-102",
      signed_date: null,
    });
  });
});

describe("parseLifecycleActions safeguards", () => {
  it("takes enactment and the law number from the structured laws list", () => {
    const result = parseLifecycleActions(
      [{ actionDate: "2026-07-11", text: "Presented to President." }],
      [{ number: "119-140", type: "Public Law" }]
    );
    expect(result).toMatchObject({ became_law_date: "2026-07-11", public_law: "119-140", law_kind: null });
  });

  it("calls a law passed after a veto enacted over veto", () => {
    const result = parseLifecycleActions([
      { actionDate: "2026-05-01", text: "Vetoed by President." },
      { actionDate: "2026-05-20", text: "Passed Senate over veto by Yea-Nay Vote. 70 - 28." },
      { actionDate: "2026-05-21", text: "Became Public Law No: 119-77." },
    ]);
    expect(result).toMatchObject({ law_kind: "enacted_over_veto", vetoed_date: "2026-05-01", unrecognized: [] });
  });

  it("does not treat floor actions about a veto as a veto", () => {
    const result = parseLifecycleActions([
      { actionDate: "2026-05-02", text: "Veto message received in the House." },
      { actionDate: "2026-05-03", text: "Motion to refer the bill and the veto message to committee agreed to." },
    ]);
    expect(result).toMatchObject({ vetoed_date: null, law_kind: null, unrecognized: [] });
  });

  it("flags presidential wording it does not know instead of guessing", () => {
    const result = parseLifecycleActions([
      { actionDate: "2026-07-01", text: "Presented to President." },
      { actionDate: "2026-07-05", text: "President returned the bill without action." },
    ]);
    expect(result.law_kind).toBeNull();
    expect(result.unrecognized).toEqual(["2026-07-05: President returned the bill without action."]);
  });

  it("states no kind when signed and unsigned wording conflict", () => {
    const result = parseLifecycleActions([
      { actionDate: "2026-07-11", text: "Signed by President." },
      { actionDate: "2026-07-11", text: "Sent to Archivist of the United States unsigned." },
    ]);
    expect(result.law_kind).toBeNull();
    expect(result.became_law_date).toBe("2026-07-11");
    expect(result.unrecognized).toHaveLength(1);
  });
});

describe("isTerminalLifecycle", () => {
  it("is NOT terminal for a bare veto (Congress may still override)", () => {
    expect(
      isTerminalLifecycle({
        law_kind: "vetoed",
        signed_date: null,
        vetoed_date: "2026-05-01",
        became_law_date: null,
      })
    ).toBe(false);
  });

  it("is NOT terminal for bare signed_date (keep refreshing until public law lands)", () => {
    expect(
      isTerminalLifecycle({
        law_kind: "signed",
        signed_date: "2026-07-02",
        vetoed_date: null,
        became_law_date: null,
      })
    ).toBe(false);
  });

  it("is terminal when became_law_date is set (and public_law for unsigned)", () => {
    expect(
      isTerminalLifecycle({
        law_kind: null,
        signed_date: null,
        vetoed_date: null,
        became_law_date: "2026-07-11",
      })
    ).toBe(true);
    expect(
      isTerminalLifecycle({
        law_kind: "signed",
        signed_date: "2026-07-02",
        vetoed_date: null,
        became_law_date: "2026-07-02",
      })
    ).toBe(true);
    expect(
      isTerminalLifecycle({
        law_kind: "law_unsigned",
        signed_date: null,
        vetoed_date: null,
        became_law_date: "2026-07-11",
        public_law: null,
      })
    ).toBe(false);
    expect(
      isTerminalLifecycle({
        law_kind: "law_unsigned",
        signed_date: null,
        vetoed_date: null,
        became_law_date: "2026-07-11",
        public_law: "119-42",
      })
    ).toBe(true);
    expect(
      isTerminalLifecycle({
        law_kind: null,
        signed_date: null,
        vetoed_date: null,
        became_law_date: null,
      })
    ).toBe(false);
  });
});
