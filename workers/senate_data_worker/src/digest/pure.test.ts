import { describe, expect, it } from "vitest";
import { billBodyXml, billXmlToText, splitBillParts } from "./bill-text-parse";
import { checkSummary, citedSections, hasSourceNumber, numbersIn, sectionText, type CheckableSources } from "./checks";
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

  it("accepts a correctly rounded large amount, never a wrong rounding or a single-digit one", () => {
    const deficit = sources({ text: "SEC. 2. Deficits\nFiscal year 2027: $1,360,279,000,000." });
    const at = (amount: string) =>
      checkSummary(summary({ key_points: [{ text: `Sets the 2027 deficit at ${amount}`, section: "Sec. 2" }] }), deficit).blocking;
    expect(at("$1.36 trillion")).toEqual([]);
    expect(at("$1.4 trillion")).toEqual([]);
    expect(at("$1.37 trillion")).toEqual(["number not in sources: 1370000000000"]);
    expect(at("$1 trillion")).toEqual(["number not in sources: 1000000000000"]);
  });

  it("rounds only large amounts, at the right magnitude, and more strictly against the whole bill", () => {
    const set = (...ns: number[]) => new Set(ns);
    expect(hasSourceNumber(set(452_318), 450_000)).toBe(false);
    expect(hasSourceNumber(set(1_360_279_000_000), 136_000_000_000)).toBe(false);
    // A correct rounding that carries to a round number.
    expect(hasSourceNumber(set(19_960_000_000), 20_000_000_000)).toBe(true);
    expect(hasSourceNumber(set(19_960_000_000), 20_000_000_000, 3)).toBe(true); // "$20.0 billion"
    expect(hasSourceNumber(set(19_400_000_000), 20_000_000_000)).toBe(false);
    // Two digits pass within a cited section; the whole bill needs three.
    expect(hasSourceNumber(set(1_360_279_000_000), 1_400_000_000_000)).toBe(true);
    expect(hasSourceNumber(set(1_360_279_000_000), 1_400_000_000_000, 3)).toBe(false);
    expect(hasSourceNumber(set(1_360_279_000_000), 1_360_000_000_000, 3)).toBe(true);
  });

  it("warns, not blocks, on a correct rounding of a figure outside the cited section", () => {
    const text = "SEC. 2. Deficits\nFiscal year 2027: $1,360,279,000,000.\n\nSEC. 3. Reports\nA report.";
    const result = checkSummary(summary({ key_points: [{ text: "Sets the deficit at $1.36 trillion", section: "Sec. 3" }] }), sources({ text }));
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toContain("number not in cited section (Sec. 3): 1360000000000");
  });

  it("reads numbers the bill spells out", () => {
    const spelled = [...numbersIn("a workweek longer than thirty-two hours, then thirty eight, then Ninety-Nine")];
    expect(spelled).toEqual(expect.arrayContaining([32, 38, 99]));
    // A compound is one number, not also its parts.
    expect(spelled).not.toEqual(expect.arrayContaining([30]));
    expect(spelled).not.toEqual(expect.arrayContaining([2]));
    const hours = sources({ text: "SEC. 2. Hours\nno more than twenty-one hours" });
    expect(checkSummary(summary({ key_points: [{ text: "Caps the week at 20 hours", section: "Sec. 2" }] }), hours).blocking).toEqual([
      "number not in sources: 20",
    ]);
    const workweek = sources({ text: "SEC. 2. Workweek\nfor a workweek longer than thirty-two hours" });
    expect(checkSummary(summary({ key_points: [{ text: "Cuts the workweek to 32 hours", section: "Sec. 2" }] }), workweek).blocking).toEqual([]);
  });

  it("allows a judging word only as the bill's own named or defined term, never its findings' framing", () => {
    const bill = sources({
      title: "Critical Materials Future Act of 2025",
      text:
        "SEC. 2. Definitions\nThe term “harmful algal bloom” means a bloom. " +
        "“(3) the term ‘critical material’ means a material.”\n\nSEC. 3. Findings\nWildfires are devastating wildfires.",
    });
    const blocked = (what: string) =>
      checkSummary(summary({ what_it_does: what, key_points: [{ text: "Starts a pilot program", section: null }] }), bill).blocking;
    expect(blocked("Funds critical materials processing and tracks harmful algal blooms.")).toEqual([]);
    expect(blocked("Funds critical-materials processing.")).toEqual([]);
    expect(blocked("Funds critical materials processing, a critical step.")).toEqual(['judging word "critical"']);
    expect(blocked("Responds to devastating wildfires.")).toEqual(['judging word "devastating"']);
    // A loaded title is the sponsor's framing too.
    const titled = sources({ title: "Stop Reckless Spending Act", text: "SEC. 2. Limits\nLimits spending." });
    expect(
      checkSummary(summary({ what_it_does: "Ends reckless spending.", key_points: [{ text: "Limits spending", section: null }] }), titled).blocking
    ).toEqual(['judging word "reckless"']);
    // A phrase never spans two fields.
    const spanning = summary({ headline: "Bill would make funding critical", what_it_does: "Materials processing gets funds.", key_points: [{ text: "Starts a pilot", section: null }] });
    expect(checkSummary(spanning, bill).blocking).toEqual(['judging word "critical"']);
  });

  it("blocks a headline about the vote, which the page already shows", () => {
    const at = (headline: string) => checkSummary(summary({ headline }), sources()).blocking;
    expect(at("House votes to cancel California's harbor boat pollution rules")).toEqual(["headline mentions the vote"]);
    expect(at("Senate rejects plan to cap airline fees at the service cost")).toEqual(["headline mentions the vote"]);
    expect(at("Resolution would direct U.S. forces out of hostilities with Iran")).toEqual([]);
    expect(at("Bill would require House members to disclose stock trades")).toEqual([]);
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

  it("gives no share to rows that cite the same part, since each would claim all of it", () => {
    const parts = [
      { label: "Title VII — Finance", text: "", tokens: 530 },
      { label: "Title I — Agriculture", text: "", tokens: 90 },
    ];
    const reply = JSON.stringify({
      headline: "Law extends tax cuts and changes Medicaid",
      what_it_does: "Does things.",
      key_points: ["Extends tax cuts"],
      inside: [
        { part: "Taxes", summary: "Extends cuts", section: "Title VII" },
        { part: "Health care", summary: "Changes Medicaid", section: "Title VII / Subtitle B" },
        { part: "Food", summary: "Changes SNAP", section: "Title I" },
      ],
    });
    const rows = parseSummaryReply(reply, { basis: "text", parts, totalTokens: 1000 })!.content.inside!;
    expect(rows.map((r) => r.share)).toEqual([null, null, 9]);
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
