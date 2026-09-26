import { describe, expect, it } from "vitest";

import { OG_CARD_COLORS, type OgCardModel } from "../../../../shared/og-card";
import { buildOgCardHtml } from "./og-card-html";

const { party: PARTY, track: TRACK, law: LAW } = OG_CARD_COLORS;

function model(overrides: Partial<OgCardModel> = {}): OgCardModel {
  return {
    bill_label: "H.R. 1",
    docket: "H.R. 1 · 119th Congress",
    headline: "House passes a permitting package",
    outcome: "passed",
    outcome_label: "Passed House",
    outcome_date: null,
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
    two_thirds: false,
    ...overrides,
  };
}

/** Background colors in document order: the page, the panel, then each bar's segments and track. */
function backgroundColors(html: string): string[] {
  return [...html.matchAll(/background-color:(#[0-9a-fA-F]{6})/g)].map((m) => m[1]!);
}

/** Bar segments as `color:count`, in document order (yes bar first). */
function barSegments(html: string): string[] {
  return [...html.matchAll(/flex-grow:(\d+);flex-basis:0;height:24px;background-color:(#[0-9a-fA-F]{6})/g)].map(
    (m) => `${m[2]}:${m[1]}`
  );
}

describe("buildOgCardHtml", () => {
  it("shows the wordmark with the bill number, the headline, the outcome and both counts", () => {
    const html = buildOgCardHtml(model());
    expect(html).toContain("Track Congress · H.R. 1");
    expect(html).toContain("House passes a permitting package");
    expect(html).toContain("Passed House");
    expect(html).toMatch(/>219<\/div>.*>yes<\/div>/);
    expect(html).toMatch(/>213<\/div>.*>no<\/div>/);
  });

  it("leaves out what the picture or the message app already says", () => {
    const html = buildOgCardHtml(model());
    expect(html).not.toContain("trackcongress.org");
    expect(html).not.toContain("Sep 3, 2026");
    expect(html).not.toContain("119th Congress");
    expect(html).not.toMatch(/\bD 212\b|\bR 205\b/);
    expect(html).not.toContain("2/3");
  });

  it("splits each side's bar by party in D, I, R order on one scale, then the unfilled track", () => {
    const html = buildOgCardHtml(model());
    expect(barSegments(html)).toEqual([
      `${PARTY.D}:212`,
      `${PARTY.R}:7`,
      `${TRACK}:213`,
      `${PARTY.D}:2`,
      `${PARTY.I}:6`,
      `${PARTY.R}:205`,
      `${TRACK}:219`,
    ]);
  });

  it("draws a unanimous vote as one full yes bar and an empty no bar", () => {
    const html = buildOgCardHtml(
      model({
        tally: {
          chamber: "House",
          yeas: 424,
          nays: 0,
          party_splits: [
            { party: "D", yeas: 213, nays: 0, party_line: "yea" },
            { party: "R", yeas: 210, nays: 0, party_line: "yea" },
            { party: "I", yeas: 1, nays: 0, party_line: "yea" },
          ],
        },
      })
    );
    expect(barSegments(html)).toEqual([`${PARTY.D}:213`, `${PARTY.I}:1`, `${PARTY.R}:210`, `${TRACK}:424`]);
  });

  it("uses one neutral segment per side when the party split does not reconcile", () => {
    const html = buildOgCardHtml(
      model({ tally: { chamber: "Senate", yeas: 51, nays: 49, party_splits: [] } })
    );
    expect(barSegments(html)).toEqual([`${PARTY.Other}:51`, `${TRACK}:49`, `${PARTY.Other}:49`, `${TRACK}:51`]);
  });

  it("marks two-thirds on the yes bar only when the vote needed it", () => {
    const html = buildOgCardHtml(model({ outcome: "failed", outcome_label: "Failed House", two_thirds: true }));
    expect(html.match(/>2\/3</g)).toHaveLength(1);
    expect(html).toContain(`left:${(2 / 3) * 100}%`);
    expect(html).toContain("Failed House");
  });

  it("shows a law's date under Became law, in the law color, with no counts", () => {
    const html = buildOgCardHtml(
      model({ outcome: "law", outcome_label: "Became law", outcome_date: "Jul 4, 2025", tally: null })
    );
    expect(html).toContain(`color:${LAW};">Became law`);
    expect(html).toContain("Jul 4, 2025");
    expect(html).not.toContain(">yes<");
    expect(backgroundColors(html)).not.toContain(TRACK);
  });

  it("says only In committee for a bill with no vote yet", () => {
    const html = buildOgCardHtml(
      model({ outcome: "no_vote", outcome_label: "In committee", tally: null, status_line: "Introduced · In committee" })
    );
    expect(html).toContain("In committee");
    expect(html).not.toContain("No vote yet");
    expect(html).not.toContain(">yes<");
  });

  it("neutralizes angle brackets without entity-encoding text (satori prints entities literally)", () => {
    const html = buildOgCardHtml(
      model({ bill_label: `H.R. 1 <x>`, headline: `Say <b>no</b> & "maybe"`, outcome_label: `Passed <House>` })
    );
    expect(html).not.toContain("<x>");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<House>");
    expect(html).not.toContain("&amp;");
    expect(html).not.toContain("&quot;");
    expect(html).toContain(`H.R. 1 ‹x›`);
    expect(html).toContain(`Say ‹b›no‹/b› & "maybe"`);
    expect(html).toContain(`Passed ‹House›`);
  });
});
