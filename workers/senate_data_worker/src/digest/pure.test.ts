import { describe, expect, it } from "vitest";
import { billBodyXml, billXmlToText, splitBillParts } from "./bill-text-parse";
import { checkSummary, citedSections, numbersIn, sectionText, type CheckableSources } from "./checks";
import { parseSummaryReply } from "./parse";
import { billStatus, fingerprintOf } from "./prepare";
import { singlePassMessages, statusLabel, type DigestBillInput } from "./prompt";

const section = (n: number, header: string, body: string) =>
  `<section><enum>${n}.</enum><header>${header}</header><subsection><text>${body}</text></subsection></section>`;

const title = (n: string, header: string, body: string) => `<title><enum>${n}</enum><header>${header}</header>${body}</title>`;

describe("bill text", () => {
  it("keeps section numbers on their own lines, quotes quoted and entities decoded", () => {
    const text = billXmlToText(
      `<legis-body>${section(2, "Fees", "Striking <quote>2024</quote> and inserting <quote>2029</quote> &amp; more.")}</legis-body>`
    );
    expect(text.split("\n").filter(Boolean)).toEqual(["SEC. 2. Fees", "Striking “2024” and inserting “2029” & more."]);
  });

  it("drops front matter before the body", () => {
    expect(billBodyXml("<bill><form>x</form><legis-body>y</legis-body></bill>")).toBe("<legis-body>y</legis-body></bill>");
  });

  it("splits long bills along their titles, leading sections first", () => {
    const lead = section(1, "Short title", "This Act may be cited as the Big Act. ".repeat(10));
    const body = `<legis-body>${lead}${title("I", "Taxes", section(101, "Rates", "a"))}${title("II", "Health", section(201, "Care", "b"))}</legis-body>`;
    const parts = splitBillParts(body);
    expect(parts.map((p) => p.label)).toEqual(["General provisions", "Title I — Taxes", "Title II — Health"]);
    expect(parts[1]!.text).toContain("SEC. 101. Rates");
    expect(parts.every((p) => p.tokens > 0)).toBe(true);
  });

  it("does not split a bill without titles or divisions", () => {
    expect(splitBillParts(`<legis-body>${section(1, "A", "b")}</legis-body>`)).toEqual([]);
  });
});

const sources = (overrides: Partial<CheckableSources> = {}): CheckableSources => ({
  type: "HR",
  title: "Airline Fee Fairness Act",
  crsText: null,
  text: "SEC. 2. Fees\nCaps fees at $45,000,000,000 by 2029.\n\nSEC. 3. Reports\nA report within 270 days.",
  statusLabel: "Introduced — not law",
  ...overrides,
});

const summary = (overrides: Record<string, unknown> = {}) => ({
  headline: "Bill would cap airline fees at what the service costs",
  what_it_does: "Caps airline fees.",
  key_points: [{ text: "Caps fees at $45 billion by 2029", section: "Sec. 2" }],
  ...overrides,
});

describe("checks", () => {
  it("reads numbers in every written form", () => {
    expect([...numbersIn("$45 billion, 15 percent, three years, 2,200")]).toEqual(
      expect.arrayContaining([45e9, 15, 3, 2200])
    );
  });

  it("expands short section ranges and finds a section's text", () => {
    expect(citedSections("Secs. 71119–71121, 5")).toEqual(["71119", "71120", "71121", "5"]);
    expect(sectionText(sources().text, ["3"])).toBe("SEC. 3. Reports\nA report within 270 days.");
  });

  it("passes a summary whose numbers come from the cited section", () => {
    expect(checkSummary(summary(), sources()).blocking).toEqual([]);
  });

  it("blocks numbers the sources do not contain, and judging words", () => {
    const result = checkSummary(
      summary({ headline: "Sweeping bill would cap airline fees at $50 billion" }),
      sources()
    );
    expect(result.blocking).toEqual(['judging word "sweeping"', "number not in sources: 50000000000"]);
  });

  it("warns, not blocks, when a key point's number is elsewhere in the bill", () => {
    const result = checkSummary(summary({ key_points: [{ text: "Reports due within 270 days", section: "Sec. 2" }] }), sources());
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toContain("number not in cited section (Sec. 2): 270");
  });

  it("allows fixed terms of art", () => {
    expect(checkSummary(summary({ what_it_does: "Funds critical minerals mapping." }), sources()).blocking).toEqual([]);
  });
});

describe("parseSummaryReply", () => {
  const context = { basis: "text" as const, parts: [], totalTokens: 1000 };

  it("stores the model's summary with the basis it was given, not the one it claims", () => {
    const reply = "```json\n" + JSON.stringify({
      headline: "Bill would cap airline fees",
      what_it_does: "Caps fees.",
      who_it_affects: ["airline passengers", "airlines", "travel agents", "extra group"],
      key_points: [{ text: "Caps fees", section: "Sec. 2" }, "Requires reports"],
      confidence: "title_only",
    }) + "\n```";
    const parsed = parseSummaryReply(reply, context)!;
    expect(parsed.content.basis).toBe("text");
    expect(parsed.content.who_it_affects).toHaveLength(3);
    expect(parsed.content.key_point_sections).toEqual(["Sec. 2", null]);
    expect(parsed.checkable.key_points[1]).toEqual({ text: "Requires reports", section: null });
  });

  it("measures each inside row's share of the bill from its parts", () => {
    const parts = [
      { label: "Title I — Taxes", text: "", tokens: 750 },
      { label: "Title II — Health", text: "", tokens: 250 },
    ];
    const reply = JSON.stringify({
      headline: "Law extends tax cuts and changes Medicaid",
      what_it_does: "Does two things.",
      key_points: ["Extends tax cuts"],
      inside: [
        { part: "Taxes", summary: "Extends cuts", section: "Title I" },
        { part: "Health", summary: "Changes Medicaid", section: "Title II / Subtitle A" },
      ],
    });
    expect(parseSummaryReply(reply, { basis: "text", parts, totalTokens: 1000 })!.content.inside!.map((r) => r.share)).toEqual([75, 25]);
  });

  it("rejects replies without a headline or JSON", () => {
    expect(parseSummaryReply("no json here", context)).toBeNull();
    expect(parseSummaryReply(JSON.stringify({ what_it_does: "x" }), context)).toBeNull();
  });
});

describe("bill status for the prompt", () => {
  const ref = { congress: 119, type: "HR", number: 1 };
  const bill = (status: DigestBillInput["status"], votes: DigestBillInput["votes"] = []): DigestBillInput => ({
    congress: 119,
    type: "HJRES",
    number: 1,
    title: "Proposing an amendment to the Constitution",
    sponsorName: null,
    status,
    committees: [],
    policyArea: null,
    votes,
    crs: null,
    textVersion: null,
    text: null,
  });

  it("reads enactment, passage and failure from the record", () => {
    expect(billStatus(ref, [], [], { became_law_date: "2026-07-04", vetoed_date: null, public_law: "119-21" })).toEqual({
      stage: "law",
      label: "Became law (Public Law 119-21)",
    });
    expect(billStatus(ref, ["Introduced in House", "Engrossed in House"], [], null).stage).toBe("passed_chamber");
    expect(billStatus(ref, ["Enrolled Bill"], [], null).stage).toBe("passed_both");
    expect(billStatus(ref, ["Introduced in House"], [], null).stage).toBe("introduced");
  });

  it("never lets the status contradict a failed vote, and marks two-thirds votes", () => {
    const failed = bill({ stage: "introduced", label: "Introduced" }, [
      { chamber: "House", vote_date: "2026-09-10", question: "On Passage", result: "Failed", yeas: 212, nays: 206 },
    ]);
    expect(statusLabel(failed)).toBe("Failed a vote in the House (212–206) — not law");
    expect(singlePassMessages(failed).user).toContain("Failed 212–206 (needed two-thirds of those voting)");
  });

  it("fingerprints stably and differently for different inputs", () => {
    expect(fingerprintOf(["v3", "a"])).toBe(fingerprintOf(["v3", "a"]));
    expect(fingerprintOf(["v3", "a"])).not.toBe(fingerprintOf(["v3", "b"]));
  });
});
