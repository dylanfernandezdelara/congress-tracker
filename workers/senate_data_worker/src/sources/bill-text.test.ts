import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILL_TEXT_MAX_BYTES,
  TEXT_CHANGES_MAX_LISTED_PROVISIONS,
  TEXT_CHANGES_MAX_STORED_PROVISIONS,
} from "../constants";
import {
  compareBillText,
  diffAddedSections,
  parseBillSections,
  selectLatestSummary,
  selectSummaryBasisVersion,
  usableTextVersions,
} from "./bill-text";

const REPORTED_XML = `<?xml version="1.0"?>
<bill>
  <legis-body>
    <section id="id1" section-type="section-one"><enum>1.</enum><header>Short title</header>
      <text>This Act may be cited as the Stop Insider Trading Act.</text>
    </section>
    <section id="id2"><enum>2.</enum><header>Prohibition on certain transactions</header>
      <text>Members may not purchase covered investments.</text>
    </section>
  </legis-body>
</bill>`;

const ENGROSSED_XML = `<?xml version="1.0"?>
<bill>
  <legis-body>
    <section id="id1" section-type="section-one"><enum>1.</enum><header>Short title</header>
      <text>This Act may be cited as the Stop Insider Trading Act.</text>
    </section>
    <section id="id2"><enum>2.</enum><header>Prohibition on certain transactions</header>
      <text>Members may not purchase covered investments.</text>
    </section>
    <section id="id3"><enum>3.</enum><header>Requiring voters to provide photo
      identification</header>
      <quoted-block>
        <section><enum>303A.</enum><header>Photo identification requirements</header>
          <text>Each State shall require photo identification.</text>
        </section>
      </quoted-block>
    </section>
  </legis-body>
</bill>`;

describe("parseBillSections", () => {
  it("reads section numbering and headings, including quoted-block insertions", () => {
    expect(parseBillSections(ENGROSSED_XML)).toEqual([
      { label: "1.", heading: "Short title" },
      { label: "2.", heading: "Prohibition on certain transactions" },
      { label: "3.", heading: "Requiring voters to provide photo identification" },
      { label: "303A.", heading: "Photo identification requirements" },
    ]);
  });

  it("skips sections without a plain-text header rather than guessing", () => {
    const xml = `<section><enum>4.</enum><header>Ok</header></section>
      <section><enum>5.</enum><header>Has <term>markup</term></header></section>
      <section><enum>6.</enum></section>`;
    expect(parseBillSections(xml)).toEqual([{ label: "4.", heading: "Ok" }]);
  });

  it("returns nothing for documents without sections (simple resolutions)", () => {
    expect(parseBillSections("<resolution><resolution-body>Resolved.</resolution-body></resolution>")).toEqual([]);
  });
});

describe("diffAddedSections", () => {
  it("reports sections absent from the summarized text", () => {
    const result = diffAddedSections(
      parseBillSections(REPORTED_XML),
      parseBillSections(ENGROSSED_XML)
    );
    expect(result.added).toEqual([
      { label: "3.", heading: "Requiring voters to provide photo identification" },
      { label: "303A.", heading: "Photo identification requirements" },
    ]);
    expect(result.moreAddedCount).toBe(0);
  });

  it("names the inserted section, not the neighbour it renumbered", () => {
    // H.R. 7128 (119th) inserted "Reporting" as section 4, pushing "Technical
    // amendments" from 4 to 5. Matching on section number alone reports the
    // renumbered neighbour and hides the provision that was actually added.
    const basis = [
      { label: "1.", heading: "Short title" },
      { label: "2.", heading: "Extension" },
      { label: "3.", heading: "Improvements to certification process" },
      { label: "4.", heading: "Technical amendments" },
    ];
    const latest = [
      { label: "1.", heading: "Short title" },
      { label: "2.", heading: "Extension" },
      { label: "3.", heading: "Improvements to certification process" },
      { label: "4.", heading: "Reporting" },
      { label: "5.", heading: "Technical amendments" },
    ];
    expect(diffAddedSections(basis, latest).added).toEqual([
      { label: "4.", heading: "Reporting" },
    ]);
  });

  it("separates a genuinely new section from headings shortened in place", () => {
    // H.R. 6955 (119th) shortened the section 177/178 headings and added
    // section 803. Only 803 is new text.
    const basis = [
      { label: "177.", heading: "Periodic adjustments to thresholds to account for increases in current-dollar United States gross domestic product" },
      { label: "178.", heading: "Adjustments to thresholds established by rule to account for increases in current-dollar United States gross domestic product" },
      { label: "802.", heading: "Bank-Fintech Partnership Enhancement" },
    ];
    const latest = [
      { label: "177.", heading: "Periodic adjustments to thresholds" },
      { label: "178.", heading: "Periodic adjustments to thresholds established by rule" },
      { label: "802.", heading: "Bank-Fintech Partnership Enhancement" },
      { label: "803.", heading: "Discretionary surplus fund" },
    ];
    expect(diffAddedSections(basis, latest).added).toEqual([
      { label: "803.", heading: "Discretionary surplus fund" },
    ]);
  });

  it("treats a section moved to a new number as unchanged text", () => {
    // H.R. 6955 renumbered "Tailoring and Indexing Enhanced Regulations" from
    // 204 to 203 when earlier sections were dropped.
    const basis = [
      { label: "203.", heading: "Community Bank Leverage Improvement" },
      { label: "204.", heading: "Tailoring and Indexing Enhanced Regulations" },
    ];
    const latest = [{ label: "203.", heading: "Tailoring and Indexing Enhanced Regulations" }];
    expect(diffAddedSections(basis, latest).added).toEqual([]);
  });

  it("ignores a reworded heading under the same section number", () => {
    // H.R. 1181 renamed section 2 between prints; that is an edit, not an addition.
    const basis = [{ label: "2.", heading: "Distinguishing firearms sales" }];
    const latest = [{ label: "2.", heading: "Distinguishing firearm retailers prohibited" }];
    expect(diffAddedSections(basis, latest).added).toEqual([]);
  });

  it("does not let one dropped section mask two reworded headings", () => {
    // The same-number edit allowance is consumed per basis section, so a second
    // unmatched heading under a number the basis no longer has is still added.
    const basis = [{ label: "5.", heading: "Original heading" }];
    const latest = [
      { label: "5.", heading: "Reworded heading" },
      { label: "6.", heading: "Brand new provision" },
    ];
    expect(diffAddedSections(basis, latest).added).toEqual([
      { label: "6.", heading: "Brand new provision" },
    ]);
  });

  it("treats punctuation, case, and quote glyphs as the same heading", () => {
    expect(
      diffAddedSections(
        [{ label: "303a", heading: "Regulators\u2019 exams" }],
        [{ label: "303A.", heading: "Regulators' Exams" }]
      ).added
    ).toEqual([]);
  });

  it("caps the listed sections and counts the rest when given an explicit limit", () => {
    const latest = Array.from({ length: 9 }, (_, i) => ({
      label: `${i + 1}.`,
      heading: `Section ${i + 1}`,
    }));
    const result = diffAddedSections([], latest, TEXT_CHANGES_MAX_LISTED_PROVISIONS);
    expect(result.added).toHaveLength(TEXT_CHANGES_MAX_LISTED_PROVISIONS);
    expect(result.moreAddedCount).toBe(4);
  });

  it("stores every addition up to the storage cap with no overflow count", () => {
    // More than the initial UI density (5) but within what the feed persists.
    const count = TEXT_CHANGES_MAX_LISTED_PROVISIONS + 3;
    const latest = Array.from({ length: count }, (_, i) => ({
      label: `${i + 1}.`,
      heading: `Section ${i + 1}`,
    }));
    const result = diffAddedSections([], latest);
    expect(result.added).toHaveLength(count);
    expect(result.moreAddedCount).toBe(0);
  });

  it("stores up to the storage cap and counts only genuine overflow", () => {
    const overflow = 7;
    const latest = Array.from(
      { length: TEXT_CHANGES_MAX_STORED_PROVISIONS + overflow },
      (_, i) => ({
        label: `${i + 1}.`,
        heading: `Section ${i + 1}`,
      })
    );
    const result = diffAddedSections([], latest);
    expect(result.added).toHaveLength(TEXT_CHANGES_MAX_STORED_PROVISIONS);
    expect(result.moreAddedCount).toBe(overflow);
  });

  it("does not double-count a section number repeated in the latest text", () => {
    const result = diffAddedSections(
      [],
      [
        { label: "3.", heading: "Photo identification" },
        { label: "3.", heading: "Photo identification" },
      ]
    );
    expect(result.added).toHaveLength(1);
    expect(result.moreAddedCount).toBe(0);
  });
});

describe("compareBillText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(byUrl: Record<string, string>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => new Response(byUrl[String(input)] ?? "", { status: 200 }))
    );
  }

  const basisVersion = { type: "Reported in House", date: "2026-02-03", xmlUrl: "https://x.test/rh.xml" };
  const latestVersion = { type: "Engrossed in House", date: "2026-07-22", xmlUrl: "https://x.test/eh.xml" };

  it("reports provisions added after the summarized version", async () => {
    stubFetch({ "https://x.test/rh.xml": REPORTED_XML, "https://x.test/eh.xml": ENGROSSED_XML });

    const changes = await compareBillText({
      summaryDate: "2026-02-03",
      summaryVersion: basisVersion,
      latestVersion,
    });

    expect(changes).toMatchObject({
      summary_version: "Reported in House",
      latest_version: "Engrossed in House",
      added_provisions: [
        { label: "3.", heading: "Requiring voters to provide photo identification" },
        { label: "303A.", heading: "Photo identification requirements" },
      ],
      more_added_count: 0,
    });
  });

  it("reports nothing when the summarized text has no parseable sections", async () => {
    // Otherwise every section of the newer text would look newly added.
    stubFetch({
      "https://x.test/rh.xml": "<resolution><resolution-body>Resolved.</resolution-body></resolution>",
      "https://x.test/eh.xml": ENGROSSED_XML,
    });

    await expect(
      compareBillText({
        summaryDate: "2026-02-03",
        summaryVersion: basisVersion,
        latestVersion,
      })
    ).resolves.toBeNull();
  });

  it("skips documents larger than the byte cap even without a Content-Length", async () => {
    // Congress.gov omits Content-Length on chunked responses, so the limit has
    // to hold while reading the body.
    const oversize = `<bill>${"x".repeat(BILL_TEXT_MAX_BYTES + 1)}</bill>`;
    stubFetch({ "https://x.test/rh.xml": REPORTED_XML, "https://x.test/eh.xml": oversize });

    await expect(
      compareBillText({
        summaryDate: "2026-02-03",
        summaryVersion: basisVersion,
        latestVersion,
      })
    ).resolves.toBeNull();
  });

  it("preserves multi-byte characters that span read chunks", async () => {
    const engrossedWithCurlyQuote = ENGROSSED_XML.replace(
      "Photo identification requirements",
      "Regulators\u2019 photo identification requirements"
    );
    stubFetch({
      "https://x.test/rh.xml": REPORTED_XML,
      "https://x.test/eh.xml": engrossedWithCurlyQuote,
    });

    const changes = await compareBillText({
      summaryDate: "2026-02-03",
      summaryVersion: basisVersion,
      latestVersion,
    });

    expect(changes?.added_provisions).toContainEqual({
      label: "303A.",
      heading: "Regulators\u2019 photo identification requirements",
    });
  });

  it("reports nothing when the summary already describes the newest text", async () => {
    await expect(
      compareBillText({
        summaryDate: "2026-07-22",
        summaryVersion: latestVersion,
        latestVersion,
      })
    ).resolves.toBeNull();
  });
});

describe("usableTextVersions", () => {
  it("keeps only dated versions with an XML format and sorts oldest first", () => {
    const versions = usableTextVersions([
      {
        type: "Engrossed in House",
        date: "2026-07-22T04:00:00Z",
        formats: [{ type: "Formatted XML", url: "https://example.test/eh.xml" }],
      },
      {
        type: "Public Law",
        date: "2026-08-01T04:00:00Z",
        formats: [{ type: "Formatted Text", url: "https://example.test/pl.htm" }],
      },
      {
        type: "Reported in House",
        date: "2026-02-03T05:00:00Z",
        formats: [{ type: "Formatted XML", url: "https://example.test/rh.xml" }],
      },
      { type: "No date", formats: [{ type: "Formatted XML", url: "https://example.test/x.xml" }] },
    ]);

    expect(versions).toEqual([
      { type: "Reported in House", date: "2026-02-03", xmlUrl: "https://example.test/rh.xml" },
      { type: "Engrossed in House", date: "2026-07-22", xmlUrl: "https://example.test/eh.xml" },
    ]);
  });
});

describe("selectSummaryBasisVersion", () => {
  const versions = [
    { type: "Introduced in House", date: "2026-01-12", xmlUrl: "ih" },
    { type: "Reported in House", date: "2026-02-03", xmlUrl: "rh" },
    { type: "Engrossed in House", date: "2026-07-22", xmlUrl: "eh" },
  ];

  it("picks the newest version published on or before the summary date", () => {
    expect(selectSummaryBasisVersion(versions, "2026-02-03")?.type).toBe("Reported in House");
    expect(selectSummaryBasisVersion(versions, "2026-07-01")?.type).toBe("Reported in House");
    expect(selectSummaryBasisVersion(versions, "2026-08-01")?.type).toBe("Engrossed in House");
  });

  it("returns null when no text predates the summary or no summary exists", () => {
    expect(selectSummaryBasisVersion(versions, "2026-01-01")).toBeNull();
    expect(selectSummaryBasisVersion(versions, null)).toBeNull();
  });
});

describe("selectLatestSummary", () => {
  it("picks the most recently updated summary", () => {
    expect(
      selectLatestSummary([
        { actionDate: "2026-01-12", updateDate: "2026-01-13T00:00:00Z" },
        { actionDate: "2026-02-03", updateDate: "2026-02-04T00:00:00Z" },
      ])?.actionDate
    ).toBe("2026-02-03");
  });

  it("returns null with no summaries", () => {
    expect(selectLatestSummary([])).toBeNull();
  });
});
