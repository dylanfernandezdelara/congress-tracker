import { describe, expect, it } from "vitest";

import type { OgCardModel, OgCardTally } from "../../../../shared/og-card";
import { OG_CARD_SITE_LABEL } from "../../../../shared/og-card";
import { buildOgCardHtml, ogCardLegend } from "./og-card-html";

function model(overrides: Partial<OgCardModel> = {}): OgCardModel {
  return {
    docket: "H.R. 1 · 119th Congress",
    headline: "House passes a permitting package",
    quote: null,
    status_line: "Passed House 219–213 · Sep 3, 2026",
    tally: {
      chamber: "House",
      yeas: 219,
      nays: 213,
      party_splits: [
        { party: "D", yeas: 212, nays: 2, party_line: "yea" },
        { party: "R", yeas: 7, nays: 205, party_line: "nay" },
        { party: "I", yeas: 0, nays: 6, party_line: "nay" },
      ],
    },
    ...overrides,
  };
}

function backgroundColors(html: string): string[] {
  return [...html.matchAll(/background-color:(#[0-9a-fA-F]{6})/g)].map((m) => m[1]!);
}

describe("ogCardLegend", () => {
  it("uses Yea/Nay totals when there are no party splits", () => {
    const tally: OgCardTally = {
      chamber: "House",
      yeas: 219,
      nays: 213,
      party_splits: [],
    };
    expect(ogCardLegend(tally)).toEqual({ yea: "Yea 219", nay: "Nay 213" });
  });

  it("prefixes per-party counts in bar order, skipping zeros", () => {
    const tally: OgCardTally = {
      chamber: "House",
      yeas: 219,
      nays: 213,
      party_splits: [
        { party: "D", yeas: 212, nays: 2, party_line: "yea" },
        { party: "R", yeas: 7, nays: 205, party_line: "nay" },
        { party: "I", yeas: 0, nays: 6, party_line: "nay" },
      ],
    };
    expect(ogCardLegend(tally)).toEqual({
      yea: "Yea 219 · D 212 · R 7",
      nay: "Nay 213 · R 205 · I 6 · D 2",
    });
  });
});

describe("buildOgCardHtml", () => {
  it("renders a sans headline when quote is null", () => {
    const html = buildOgCardHtml(model({ quote: null }));
    expect(html).toContain("TRACK CONGRESS");
    expect(html).toContain("H.R. 1 · 119th Congress");
    expect(html).toContain("House passes a permitting package");
    expect(html).toContain("font-size:58px");
    expect(html).toContain("font-weight:700");
    expect(html).toContain("font-family:Inter");
    expect(html).not.toContain("\u201c");
    expect(html).toContain(OG_CARD_SITE_LABEL);
    expect(html).toContain("Passed House 219–213 · Sep 3, 2026");
  });

  it("renders a serif quote with a decorative mark and muted headline", () => {
    const html = buildOgCardHtml(
      model({
        quote: "This bill speeds energy permits.",
        headline: "House passes a permitting package",
      })
    );
    expect(html).toContain("\u201c");
    expect(html).toContain("This bill speeds energy permits.");
    expect(html).toContain("font-size:46px");
    expect(html).toContain("font-family:'Source Serif 4'");
    expect(html).toContain("line-clamp:4");
    expect(html).toContain("font-size:22px");
    expect(html).toContain("text-overflow:ellipsis");
    expect(html).toContain("House passes a permitting package");
    expect(html).not.toContain("font-size:58px");
  });

  it("neutralizes angle brackets without entity-encoding text (satori prints entities literally)", () => {
    const html = buildOgCardHtml(
      model({
        docket: `H.R. 1 <x> & "y"`,
        headline: `Say <b>no</b> & "maybe"`,
        quote: `He said <yes> & "go"`,
        status_line: `Passed <House> & "219"`,
        tally: null,
      })
    );
    expect(html).not.toContain("<x>");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<yes>");
    expect(html).not.toContain("<House>");
    expect(html).not.toContain("&amp;");
    expect(html).not.toContain("&quot;");
    expect(html).toContain(`H.R. 1 \u2039x\u203a & "y"`);
    expect(html).toContain(`Say \u2039b\u203ano\u2039/b\u203a & "maybe"`);
    expect(html).toContain(`He said \u2039yes\u203a & "go"`);
    expect(html).toContain(`Passed \u2039House\u203a & "219"`);
  });

  it("draws party-split bar segments in locked order and colors", () => {
    const html = buildOgCardHtml(model());
    const colors = backgroundColors(html);
    // card #ffffff, accent #111827, then yea D→R and nay R→I→D
    expect(colors).toContain("#2563eb");
    expect(colors).toContain("#dc2626");
    expect(colors).toContain("#fecaca");
    expect(colors).toContain("#ddd6fe");
    expect(colors).toContain("#bfdbfe");
    const barColors = colors.filter((c) =>
      ["#2563eb", "#dc2626", "#fecaca", "#ddd6fe", "#bfdbfe"].includes(c)
    );
    expect(barColors).toEqual(["#2563eb", "#dc2626", "#fecaca", "#ddd6fe", "#bfdbfe"]);
    expect(html).toContain("Yea 219 · D 212 · R 7");
    expect(html).toContain("Nay 213 · R 205 · I 6 · D 2");
    expect(html).toContain("height:14px");
    expect(html).toContain("margin-right:2px");
    expect(html).not.toContain("In committee");
  });

  it("uses Other-party colors when the tally has no splits", () => {
    const html = buildOgCardHtml(
      model({
        tally: { chamber: "Senate", yeas: 51, nays: 49, party_splits: [] },
      })
    );
    const barColors = backgroundColors(html).filter((c) => c === "#374151" || c === "#d1d5db");
    expect(barColors).toEqual(["#374151", "#d1d5db"]);
    expect(html).toContain("Yea 51");
    expect(html).toContain("Nay 49");
  });

  it("renders a status chip instead of a bar when tally is null", () => {
    const html = buildOgCardHtml(
      model({
        status_line: "Became law · Sep 1, 2026",
        tally: null,
      })
    );
    expect(html).toContain("Sep 1, 2026");
    expect(html).toContain("border:2px solid #e5e7eb");
    expect(html).not.toContain("background-color:#2563eb");
    expect(html).not.toContain("Yea ");
  });

  it("uses In committee on the chip when status_line has no separator", () => {
    const html = buildOgCardHtml(
      model({
        status_line: "Still moving",
        tally: null,
      })
    );
    expect(html).toContain("In committee");
    expect(html).toContain("Still moving");
  });
});
