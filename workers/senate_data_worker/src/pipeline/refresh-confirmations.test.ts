import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getNomination,
  upsertNominationMetadata,
  selectNominationsNeedingEnrichment,
  lookupNomineeWikipedia,
  rewriteConfirmationBackground,
  resolveOpenRouterModel,
  fetchNominationBundle,
} = vi.hoisted(() => ({
  getNomination: vi.fn(),
  upsertNominationMetadata: vi.fn(),
  selectNominationsNeedingEnrichment: vi.fn(),
  lookupNomineeWikipedia: vi.fn(),
  rewriteConfirmationBackground: vi.fn(),
  resolveOpenRouterModel: vi.fn(),
  fetchNominationBundle: vi.fn(),
}));

vi.mock("../d1/nominations", async () => {
  const actual = await vi.importActual<typeof import("../d1/nominations")>(
    "../d1/nominations"
  );
  return {
    ...actual,
    getNomination,
    upsertNominationMetadata,
    selectNominationsNeedingEnrichment,
    upsertNominationStub: vi.fn(),
  };
});

vi.mock("../d1/confirmation-votes", () => ({
  upsertConfirmationVote: vi.fn(),
}));

vi.mock("../sources/nomination-client", async () => {
  const actual = await vi.importActual<
    typeof import("../sources/nomination-client")
  >("../sources/nomination-client");
  return {
    ...actual,
    fetchNominationBundle,
  };
});

vi.mock("../sources/wikipedia", async () => {
  const actual = await vi.importActual<typeof import("../sources/wikipedia")>(
    "../sources/wikipedia"
  );
  return {
    ...actual,
    lookupNomineeWikipedia,
  };
});

vi.mock("../synthesis/confirmation-rewrite", () => ({
  rewriteConfirmationBackground,
}));

vi.mock("../synthesis/model", () => ({
  resolveOpenRouterModel,
}));

import {
  rawMarksWikipediaAttempt,
  refreshConfirmationEnrichment,
  wikipediaUrlFromRaw,
} from "./refresh-confirmations";

function nominationRow(overrides: Record<string, unknown> = {}) {
  return {
    congress: 119,
    nomination_number: 100,
    part_number: 0,
    citation: "PN100",
    description: "Jane Doe, of California, to be Secretary of Energy.",
    organization: "Department of Energy",
    position_title: "Secretary of Energy",
    nominees_json: JSON.stringify([{ display_name: "Jane Doe", state: "CA" }]),
    received_date: "2026-01-15",
    raw_background_text:
      "Jane Doe, of California, to be Secretary of Energy.\nPosition: Secretary of Energy (Department of Energy)\nNominee(s): Jane Doe (CA)",
    background_json: null,
    ...overrides,
  };
}

describe("refreshConfirmationEnrichment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOpenRouterModel.mockResolvedValue("test-model");
    selectNominationsNeedingEnrichment.mockResolvedValue([
      {
        ref: { congress: 119, number: 100, partNumber: 0 },
        result: "Confirmed",
        needsRaw: false,
        needsBackground: true,
        needsWikipedia: true,
      },
    ]);
    getNomination.mockResolvedValue(nominationRow());
    upsertNominationMetadata.mockResolvedValue(undefined);
  });

  it("keeps official About primary and stores Wikipedia as secondary enrichment", async () => {
    lookupNomineeWikipedia.mockResolvedValue({
      status: "hit",
      hit: {
        url: "https://en.wikipedia.org/wiki/Jane_Doe_(politician)",
        title: "Jane Doe (politician)",
        extract: "Jane Doe is an American energy official from California.",
      },
    });
    rewriteConfirmationBackground.mockResolvedValue({
      headline: "Jane Doe confirmed as Energy Secretary",
      what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
      background:
        "Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.",
      key_points: [],
    });

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    const result = await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(result.wikipediaLookups).toBe(1);
    expect(result.backgroundsRewritten).toBe(1);
    expect(upsertNominationMetadata).toHaveBeenCalledTimes(1);
    const saved = upsertNominationMetadata.mock.calls[0]![1] as {
      rawBackgroundText: string;
      backgroundJson: string;
    };
    expect(saved.rawBackgroundText).toContain(
      "WikipediaLookup: https://en.wikipedia.org/wiki/Jane_Doe_(politician)"
    );
    expect(saved.rawBackgroundText).toContain("Biography:");
    // Congress.gov scaffolding must survive append (not a full rebuild).
    expect(saved.rawBackgroundText).toContain("Position: Secretary of Energy");
    const parsed = JSON.parse(saved.backgroundJson);
    expect(parsed.background).toBe(
      "Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy."
    );
    expect(parsed.wikipedia_url).toBe(
      "https://en.wikipedia.org/wiki/Jane_Doe_(politician)"
    );
    expect(parsed.wikipedia_extract).toContain("American energy official");
  });

  it("seals wikipedia URL + extract from a prior raw hit marker on a later rewrite pass", async () => {
    getNomination.mockResolvedValue(
      nominationRow({
        raw_background_text:
          "Jane Doe, of California, to be Secretary of Energy.\nWikipediaLookup: https://en.wikipedia.org/wiki/Jane_Doe_(politician)\nBiography: Jane Doe is an American energy official.",
      })
    );
    rewriteConfirmationBackground.mockResolvedValue({
      headline: "Jane Doe confirmed as Energy Secretary",
      what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
      background:
        "Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.",
      key_points: [],
    });

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(lookupNomineeWikipedia).not.toHaveBeenCalled();
    const saved = upsertNominationMetadata.mock.calls[0]![1] as {
      backgroundJson: string;
    };
    const parsed = JSON.parse(saved.backgroundJson);
    expect(parsed.background).toContain("confirmed as Secretary of Energy");
    expect(parsed.wikipedia_url).toBe(
      "https://en.wikipedia.org/wiki/Jane_Doe_(politician)"
    );
    expect(parsed.wikipedia_extract).toBe("Jane Doe is an American energy official.");
  });

  it("seals wikipedia_url null from a prior miss marker without re-querying", async () => {
    getNomination.mockResolvedValue(
      nominationRow({
        raw_background_text:
          "Jane Doe, of California, to be Secretary of Energy.\nWikipediaLookup: none",
      })
    );
    rewriteConfirmationBackground.mockResolvedValue({
      headline: "Jane Doe confirmed as Energy Secretary",
      what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
      background: "Jane Doe of California was named to lead the Department of Energy.",
      key_points: [],
    });

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(lookupNomineeWikipedia).not.toHaveBeenCalled();
    const saved = upsertNominationMetadata.mock.calls[0]![1] as {
      backgroundJson: string;
    };
    const parsed = JSON.parse(saved.backgroundJson);
    expect(parsed.wikipedia_url).toBeNull();
  });

  it("omits wikipedia_url when lookup was deferred by quota so a later pass can enrich", async () => {
    // Burn the Wikipedia budget on rows that already have backgrounds, then rewrite one fresh row.
    const existingBackground = JSON.stringify({
      headline: "Prior headline",
      what_was_confirmed: "Prior confirmation.",
      background: "Prior thin blurb.",
      key_points: [],
    });
    const candidates = [
      ...Array.from({ length: 15 }, (_, i) => ({
        ref: { congress: 119, number: 200 + i, partNumber: 0 },
        result: "Confirmed",
        needsRaw: false,
        needsBackground: false,
        needsWikipedia: true,
      })),
      {
        ref: { congress: 119, number: 100, partNumber: 0 },
        result: "Confirmed",
        needsRaw: false,
        needsBackground: true,
        needsWikipedia: true,
      },
    ];
    selectNominationsNeedingEnrichment.mockResolvedValue(candidates);
    getNomination.mockImplementation(async (_db: D1Database, ref: { number: number }) => {
      if (ref.number === 100) return nominationRow();
      return nominationRow({
        nomination_number: ref.number,
        citation: `PN${ref.number}`,
        background_json: existingBackground,
      });
    });
    lookupNomineeWikipedia.mockResolvedValue({ status: "miss" });
    rewriteConfirmationBackground.mockResolvedValue({
      headline: "Jane Doe confirmed as Energy Secretary",
      what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
      background: "Jane Doe is from California.",
      key_points: [],
    });

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    const result = await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(result.wikipediaLookups).toBe(15);
    expect(result.backgroundsRewritten).toBe(1);
    const rewriteSave = upsertNominationMetadata.mock.calls.find((call) => {
      const params = call[1] as { ref: { number: number }; backgroundJson: string };
      return params.ref.number === 100;
    })![1] as { backgroundJson: string };
    const parsed = JSON.parse(rewriteSave.backgroundJson);
    expect("wikipedia_url" in parsed).toBe(false);
  });

  it("persists a miss marker when Wikipedia has no match and rewrite is unavailable", async () => {
    lookupNomineeWikipedia.mockResolvedValue({ status: "miss" });
    rewriteConfirmationBackground.mockResolvedValue(null);

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    const result = await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(result.wikipediaLookups).toBe(1);
    const saved = upsertNominationMetadata.mock.calls[0]![1] as {
      rawBackgroundText: string;
      backgroundJson: string | null;
    };
    expect(saved.rawBackgroundText).toContain("WikipediaLookup: none");
    expect(saved.backgroundJson).toBeNull();
  });

  it("does not seal a miss when Wikipedia is temporarily unavailable", async () => {
    lookupNomineeWikipedia.mockResolvedValue({
      status: "unavailable",
      error: "HTTP 503",
    });
    rewriteConfirmationBackground.mockResolvedValue({
      headline: "Jane Doe confirmed as Energy Secretary",
      what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
      background: "Jane Doe is from California.",
      key_points: [],
    });

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    const result = await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(result.wikipediaLookups).toBe(1);
    expect(result.warnings.some((w) => w.includes("Wikipedia lookup unavailable"))).toBe(
      true
    );
    const saved = upsertNominationMetadata.mock.calls[0]![1] as {
      rawBackgroundText: string;
      backgroundJson: string;
    };
    expect(saved.rawBackgroundText).not.toContain("WikipediaLookup:");
    const parsed = JSON.parse(saved.backgroundJson);
    expect("wikipedia_url" in parsed).toBe(false);
  });
});

describe("wikipedia raw markers", () => {
  it("parses hit and miss markers", () => {
    expect(rawMarksWikipediaAttempt("x\nWikipediaLookup: none")).toBe(true);
    expect(
      rawMarksWikipediaAttempt(
        "x\nWikipediaLookup: https://en.wikipedia.org/wiki/Jane_Doe"
      )
    ).toBe(true);
    expect(rawMarksWikipediaAttempt("no marker here")).toBe(false);
    expect(wikipediaUrlFromRaw("x\nWikipediaLookup: none")).toBeNull();
    expect(
      wikipediaUrlFromRaw("x\nWikipediaLookup: https://en.wikipedia.org/wiki/Jane_Doe")
    ).toBe("https://en.wikipedia.org/wiki/Jane_Doe");
    expect(wikipediaUrlFromRaw("plain")).toBeUndefined();
  });
});
