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

  it("parses veto and pocket veto codes", () => {
    expect(
      parseLifecycleActions([
        {
          actionCode: "30000",
          actionDate: "2026-05-01",
          text: "Vetoed by President.",
        },
      ]).law_kind
    ).toBe("vetoed");

    expect(
      parseLifecycleActions([
        {
          actionCode: "31000",
          actionDate: "2026-05-01",
          text: "Pocket vetoed by President.",
        },
      ])
    ).toMatchObject({
      vetoed_date: "2026-05-01",
      law_kind: "pocket_vetoed",
    });
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

  it("treats plain Became Public Law text without signing as law_unsigned", () => {
    const result = parseLifecycleActions([
      {
        actionCode: null,
        actionDate: "2026-07-11",
        text: "Became Public Law No: 119-88.",
      },
    ]);

    expect(result).toMatchObject({
      became_law_date: "2026-07-11",
      law_kind: "law_unsigned",
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

describe("isTerminalLifecycle", () => {
  it("is terminal for signed, vetoed, or became-law rows", () => {
    expect(
      isTerminalLifecycle({
        law_kind: "signed",
        signed_date: "2026-07-02",
        vetoed_date: null,
        became_law_date: null,
      })
    ).toBe(true);
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
        law_kind: null,
        signed_date: null,
        vetoed_date: null,
        became_law_date: null,
      })
    ).toBe(false);
  });
});
