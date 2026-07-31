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

import { refreshConfirmationEnrichment } from "./refresh-confirmations";

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
    rewriteConfirmationBackground.mockResolvedValue(null);
    lookupNomineeWikipedia.mockResolvedValue({ status: "miss" });
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

  it("rewrites official About first, then attaches Wikipedia as secondary fields", async () => {
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
    // Official raw source stays Congress.gov-only (no Wikipedia markers).
    expect(saved.rawBackgroundText).not.toContain("WikipediaLookup:");
    expect(saved.rawBackgroundText).not.toContain("Biography:");
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

  it("attaches Wikipedia to an existing official About without rewriting", async () => {
    const existing = {
      headline: "Jane Doe confirmed as Energy Secretary",
      what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
      background:
        "Jane Doe previously led California energy commission programs.",
      key_points: [],
    };
    getNomination.mockResolvedValue(
      nominationRow({
        background_json: JSON.stringify(existing),
      })
    );
    lookupNomineeWikipedia.mockResolvedValue({
      status: "hit",
      hit: {
        url: "https://en.wikipedia.org/wiki/Jane_Doe_(politician)",
        title: "Jane Doe (politician)",
        extract: "Jane Doe is an American energy official.",
      },
    });

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(rewriteConfirmationBackground).not.toHaveBeenCalled();
    const saved = upsertNominationMetadata.mock.calls[0]![1] as {
      backgroundJson: string;
      rawBackgroundText: string;
    };
    const parsed = JSON.parse(saved.backgroundJson);
    expect(parsed.background).toBe(existing.background);
    expect(parsed.wikipedia_url).toBe(
      "https://en.wikipedia.org/wiki/Jane_Doe_(politician)"
    );
    expect(parsed.wikipedia_extract).toBe("Jane Doe is an American energy official.");
    expect(saved.rawBackgroundText).not.toContain("WikipediaLookup:");
  });

  it("seals wikipedia_url null on a definitive miss", async () => {
    getNomination.mockResolvedValue(
      nominationRow({
        background_json: JSON.stringify({
          headline: "Jane Doe confirmed as Energy Secretary",
          what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
          background:
            "Jane Doe previously led California energy commission programs.",
          key_points: [],
        }),
      })
    );
    lookupNomineeWikipedia.mockResolvedValue({ status: "miss" });

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    const saved = upsertNominationMetadata.mock.calls[0]![1] as {
      backgroundJson: string;
    };
    const parsed = JSON.parse(saved.backgroundJson);
    expect(parsed.wikipedia_url).toBeNull();
    expect(parsed.wikipedia_extract).toBeNull();
  });

  it("omits wikipedia_url when lookup was deferred by quota so a later pass can enrich", async () => {
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

  it("does not seal Wikipedia when nominee names are missing", async () => {
    getNomination.mockResolvedValue(
      nominationRow({
        nominees_json: null,
        // Non-thin About, wiki not attempted yet — needs lookup but has no name.
        background_json: JSON.stringify({
          headline: "Jane Doe confirmed as Energy Secretary",
          what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
          background:
            "Jane Doe previously led California energy commission programs.",
          key_points: [],
        }),
      })
    );
    selectNominationsNeedingEnrichment.mockResolvedValue([
      {
        ref: { congress: 119, number: 100, partNumber: 0 },
        result: "Confirmed",
        needsRaw: false,
        needsBackground: false,
        needsWikipedia: true,
      },
    ]);

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    const result = await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(result.wikipediaLookups).toBe(0);
    expect(lookupNomineeWikipedia).not.toHaveBeenCalled();
    expect(upsertNominationMetadata).not.toHaveBeenCalled();
  });

  it("rewrites thin description-echo About and attaches Wikipedia", async () => {
    const description =
      "Walter Clayton, of New York, to be Director of National Intelligence, vice Tulsi Gabbard.";
    getNomination.mockResolvedValue(
      nominationRow({
        description,
        position_title: "Director of National Intelligence",
        organization: "Office of the Director of National Intelligence",
        nominees_json: JSON.stringify([
          { display_name: "Walter Clayton", state: "NY" },
        ]),
        raw_background_text: `${description}\nPosition: Director of National Intelligence\nNominee(s): Walter Clayton (NY)`,
        background_json: JSON.stringify({
          headline: description,
          what_was_confirmed: description,
          background: description,
          key_points: [],
          wikipedia_url: null,
          wikipedia_extract: null,
        }),
      })
    );
    selectNominationsNeedingEnrichment.mockResolvedValue([
      {
        ref: { congress: 119, number: 100, partNumber: 0 },
        result: "Confirmed",
        needsRaw: false,
        needsBackground: true,
        needsWikipedia: true,
      },
    ]);
    rewriteConfirmationBackground.mockResolvedValue({
      headline: "Walter Clayton confirmed as DNI",
      what_was_confirmed:
        "The Senate confirmed Walter Clayton as Director of National Intelligence.",
      background:
        "Walter Clayton of NY was confirmed as Director of National Intelligence.",
      key_points: [],
    });
    lookupNomineeWikipedia.mockResolvedValue({
      status: "hit",
      hit: {
        url: "https://en.wikipedia.org/wiki/Jay_Clayton_(attorney)",
        title: "Jay Clayton (attorney)",
        extract:
          'Walter Joseph "Jay" Clayton III is an American attorney who previously chaired the SEC.',
      },
    });

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    const result = await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(result.backgroundsRewritten).toBe(1);
    expect(result.wikipediaLookups).toBe(1);
    const saved = upsertNominationMetadata.mock.calls[0]![1] as {
      backgroundJson: string;
    };
    const parsed = JSON.parse(saved.backgroundJson);
    expect(parsed.wikipedia_extract).toContain("chaired the SEC");
  });

  it("does not seal a miss when Wikipedia is temporarily unavailable", async () => {
    getNomination.mockResolvedValue(
      nominationRow({
        background_json: JSON.stringify({
          headline: "Jane Doe confirmed as Energy Secretary",
          what_was_confirmed: "The Senate confirmed Jane Doe as Secretary of Energy.",
          background:
            "Jane Doe previously led California energy commission programs.",
          key_points: [],
        }),
      })
    );
    lookupNomineeWikipedia.mockResolvedValue({
      status: "unavailable",
      error: "HTTP 503",
    });

    const env = { DB: {} as D1Database, OPENROUTER_API_KEY: "x" } as import("../config").Env;
    const result = await refreshConfirmationEnrichment(env, "2026-01-01", "admin");

    expect(result.wikipediaLookups).toBe(1);
    expect(result.warnings.some((w) => w.includes("Wikipedia lookup unavailable"))).toBe(
      true
    );
    expect(upsertNominationMetadata).not.toHaveBeenCalled();
  });
});
