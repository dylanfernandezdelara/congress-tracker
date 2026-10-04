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

  // H.Res. 1585 (119th), trimmed from GovInfo BILLS-119hres1585ih.xml: the date and figures live in the preamble.
  const hres1585 =
    '<resolution resolution-stage="Introduced-in-House" resolution-type="house-resolution"><form><legis-num display="yes">H. RES. 1585</legis-num><action display="yes"><action-date date="20260924">September 24, 2026</action-date></action><legis-type>RESOLUTION</legis-type><official-title display="yes">Expressing support for <quote>National Public Lands Day</quote> and encouraging the people of the United States to visit public lands on this fee-free day.</official-title></form><preamble> \n' +
    '<whereas><text>Whereas there are over 618,000,000 acres of public lands across the United States;</text></whereas> <whereas><text>Whereas outdoor recreation contributed $696,700,000,000 to the economy of the United States in 2024;</text></whereas>\n' +
    '<whereas><text>Whereas September 26, 2026, marks <quote>National Public Lands Day</quote>: Now, therefore, be it</text></whereas></preamble><resolution-body style="traditional" id="H09D37CFE1E8E49A9BC96E785CB41919F"> \n' +
    '<section display-inline="yes-display-inline" section-type="undesignated-section" id="H8B1F857E5A98427997EE694FB4358A21"><text>That the House of Representatives supports <quote>National Public Lands Day</quote> and encourages the people of the United States to visit public lands on this fee-free day and recognize the historic, cultural, and economic impact of public lands.</text></section> </resolution-body></resolution>';

  it("keeps a resolution's preamble, one whereas clause per line, before its resolving clause", () => {
    const text = billXmlToText(billBodyXml(hres1585));
    const lines = text.split("\n").filter(Boolean);
    expect(lines[0]).toBe("PREAMBLE");
    expect(lines).toContain("Whereas September 26, 2026, marks “National Public Lands Day”: Now, therefore, be it");
    expect(lines).toContain("Whereas there are over 618,000,000 acres of public lands across the United States;");
    expect(lines.indexOf("END OF PREAMBLE")).toBeLessThan(lines.findIndex((l) => l.startsWith("That the House")));
    expect(text).not.toContain("September 24, 2026"); // front matter still dropped
    expect(lines.some((l) => /^SEC\. /.test(l))).toBe(false);
    expect(sectionText(text, ["1"])).toBeNull();
  });

  it("keeps a preamble before a bill's legis-body too", () => {
    const text = billXmlToText(billBodyXml(`<bill><form>x</form><preamble><whereas><text>Whereas a thing;</text></whereas></preamble><legis-body>${section(1, "A", "b")}</legis-body></bill>`));
    expect(text.split("\n").filter(Boolean)).toEqual(["PREAMBLE", "Whereas a thing;", "END OF PREAMBLE", "SEC. 1. A", "b"]);
    expect(sectionText(text, ["1"])).toMatch(/^SEC. 1. A\n+b$/);
  });

  it("lets a summary cite a date only the preamble holds (H.Res. 1585)", () => {
    const cite = summary({
      headline: "Resolution backs National Public Lands Day, a fee-free day",
      what_it_does: "Supports National Public Lands Day on September 26, 2026, and urges people to visit public lands.",
      key_points: [{ text: "Notes that September 26, 2026, marks National Public Lands Day", section: null }],
    });
    const src = (text: string) => sources({ type: "HRES", title: "Expressing support for “National Public Lands Day”", text });
    const bodyOnly = billXmlToText(hres1585.slice(hres1585.indexOf("<resolution-body")));
    expect(checkSummary(cite, src(bodyOnly)).blocking).toContain("number not in sources: 2026");
    expect(checkSummary(cite, src(billXmlToText(billBodyXml(hres1585)))).blocking).toEqual([]);
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

  it("blocks 'dirty' and 'polluting', except as a term the bill defines", () => {
    const engines = sources({ title: "Clean Diesel Act", text: "SEC. 2. Grants\nGrants to replace diesel engines." });
    const at = (what: string, bill = engines) =>
      checkSummary(summary({ what_it_does: what, key_points: [{ text: "Funds engine grants", section: null }] }), bill).blocking;
    expect(at("Pays for retrofitting dirty diesel engines.")).toEqual(['judging word "dirty"']);
    expect(at("Pays for replacing polluting diesel engines.")).toEqual(['judging word "polluting"']);
    expect(at("Pays for replacing older diesel engines.")).toEqual([]);
    const defined = sources({ text: "SEC. 2. Definitions\nThe term “dirty bomb” means a radiological dispersal device." });
    expect(at("Raises penalties for building a dirty bomb.", defined)).toEqual([]);
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

  it("reads ordinals, spelled out and in digits", () => {
    // HR 10422: "the fourteenth consecutive day … the thirtieth consecutive day".
    expect([...numbersIn("the fourteenth consecutive day and the thirtieth consecutive day")]).toEqual(
      expect.arrayContaining([14, 30])
    );
    const century = [...numbersIn("the twenty-first century, the thirty second time, the eighth and twelfth")];
    expect(century).toEqual(expect.arrayContaining([21, 32, 8, 12]));
    expect(century).not.toEqual(expect.arrayContaining([20]));
    expect([...numbersIn("the 14th day, the 1st, 2nd and 3rd")]).toEqual(expect.arrayContaining([14, 1, 2, 3]));
    // "-second" is a duration as often as an ordinal: "thirty-second announcement" supports both 30 and 32.
    expect([...numbersIn("a thirty-second public service announcement")]).toEqual(expect.arrayContaining([30, 32]));
    const diesel = sources({ text: "SEC. 2. Suspension\nending on the thirtieth consecutive day after the fourteenth consecutive day" });
    const straight = summary({ key_points: [{ text: "Ends after 30 straight days, starting from 14 straight days", section: "Sec. 2" }] });
    expect(checkSummary(straight, diesel).blocking).toEqual([]);
    expect(checkSummary(summary({ what_it_does: "Suspends the tax for 30 straight days.", key_points: [{ text: "Suspends the tax", section: null }] }), diesel).blocking).toEqual([]);
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
    // The same title used as a name is a name.
    expect(
      checkSummary(summary({ what_it_does: "The Stop Reckless Spending Act limits spending.", key_points: [{ text: "Limits spending", section: null }] }), titled).blocking
    ).toEqual([]);
    expect(
      checkSummary(summary({ what_it_does: "Called the “Stop Reckless Spending Act,” it limits spending.", key_points: [{ text: "Limits spending", section: null }] }), titled).blocking
    ).toEqual([]);
    // A phrase never spans two fields.
    const spanning = summary({ headline: "Bill would make funding critical", what_it_does: "Materials processing gets funds.", key_points: [{ text: "Starts a pilot", section: null }] });
    expect(checkSummary(spanning, bill).blocking).toEqual(['judging word "critical"']);
  });

  it("lets terms of art and proper names through, not the summary's own judgments (S.5406, S.790, HR 7618)", () => {
    const check = (bill: CheckableSources, what: string) =>
      checkSummary(summary({ what_it_does: what, key_points: [{ text: "Changes the program", section: null }] }), bill).blocking;
    const s5406 = sources({
      title: "VA Salary Cap Waiver Adjustment Act",
      text: "SEC. 2. Modification of limitation on waiver for pay of critical health care personnel\n\nSection 7431(e)(6) of title 38, United States Code, is amended—",
    });
    expect(check(s5406, "Would let VA waive pay caps for critical health care personnel longer")).toEqual([]);
    expect(check(s5406, "Would let VA waive pay caps for critical staff")).toEqual(['judging word "critical"']);
    const s790 = sources({
      title: "A bill to designate the National Historic Trails Interpretive Center as the Barbara L. Cubin Center.",
      text: "The National Historic Trails Interpretive Center in Casper, Wyoming, shall be known and designated as the “Barbara L. Cubin National Historic Trails Interpretive Center”.",
    });
    expect(check(s790, "Renames the National Historic Trails Interpretive Center for Barbara Cubin")).toEqual([]);
    expect(check(s790, "Renames a historic Wyoming trails center")).toEqual(['judging word "historic"']);
    // Capitalized, but not a name the sources hold.
    expect(check(s790, "Historic Wyoming center gets a new name")).toEqual(['judging word "historic"']);
    // A span opening on the judging word is a sentence start, findings line or header unless the source has it
    // mid-sentence or it is the whole short title.
    const opens = (text: string, title: string | null = "Some Act") => (what: string) => check(sources({ title, text }), what);
    expect(opens("SEC. 2. Critical Federal programs")("Critical Federal programs keep funding.")).toEqual(['judging word "critical"']);
    // A prefix of the short title, reached through its "cited as" clause, is still the sponsor's framing.
    expect(opens("This Act may be cited as the “Unprecedented Border Crisis Response Act”.", "To respond.")("Responds to the Unprecedented Border Crisis.")).toEqual(['judging word "unprecedented"']);
    expect(opens("This Act may be cited as the “Protecting Americans from Dangerous Drones Act”.", "To protect.")("Bans Dangerous Drones at federal sites.")).toEqual(['judging word "dangerous"']);
    expect(opens("This Act may be cited as the “Unprecedented Border Crisis Response Act”.", "To respond.")("Unprecedented Border Crisis Response Act funds agents.")).toEqual([]);
    expect(opens("SEC. 2. Findings\n(1) Massive Federal spending has driven inflation.")("Massive Federal spending is cut.")).toEqual(['judging word "massive"']);
    expect(opens("SEC. 2. Findings\n(2) Dangerous Chinese drones threaten security.")("Bans Dangerous Chinese drones.")).toEqual(['judging word "dangerous"']);
    expect(opens("TITLE I — Historic Investment in Rural Broadband")("Historic Investment in Rural Broadband funds towers.")).toEqual(['judging word "historic"']);
    expect(
      checkSummary(summary({ headline: "Historic Wildfires in California get aid", key_points: [{ text: "Funds recovery", section: null }] }), sources({ text: "Historic Wildfires in California burned." })).blocking
    ).toEqual(['judging word "historic"']);
    const crisis = opens("SEC. 2. Response\nFunds the border.", "Unprecedented Border Crisis Response Act");
    expect(crisis("Responds to the Unprecedented Border Crisis.")).toEqual(['judging word "unprecedented"']);
    expect(crisis("The Unprecedented Border Crisis Response Act funds the border.")).toEqual([]);
    // Whole words only: a substring of a longer name in the source is not that name.
    expect(opens("the National Historic Riverfront Centers program")("Funds the Historic Riverfront Center.")).toEqual(['judging word "historic"']);
    expect(opens("funds the Historic Riverfront Center in Casper")("Funds the Historic Riverfront Center.")).toEqual([]);
    const hr7618 = sources({ title: "Wildfire Recovery Act", text: "SEC. 2. Findings\nWildfires are devastating wildfires." });
    expect(check(hr7618, "Funds historic preservation organizations and historic sites hit by wildfires")).toEqual([]);
    expect(check(hr7618, "Responds to devastating wildfires")).toEqual(['judging word "devastating"']);
  });

  it("does not read a number opening one field as a bill citation closing the last", () => {
    const bill = sources({ text: "SEC. 2. Shrimp imports into the United States are prohibited." });
    const s = summary({ what_it_does: "Bans shrimp imports into the U.S.", who_it_affects: ["12,000 shrimp farmers"], key_points: [{ text: "Bans imports", section: null }] });
    expect(checkSummary(s, bill).blocking).toEqual(["number not in sources: 12000"]);
  });

  it("reads a bill XML <term> definition as the bill's own term (HR 10395, 119th)", () => {
    // Trimmed from GovInfo BILLS-119hr10395ih.xml: definitions mark the term with <term>, not <quote>.
    const xml =
      '<legis-body id="H2E65B6745487400BB9382302B62D0EC0" style="OLC">' +
      '<section id="H300BA090AB884897BF5C1149E94CE4DC"><enum>2.</enum><header>Definitions</header><text display-inline="no-display-inline">In this Act:</text> ' +
      '<paragraph id="H5DB926A005DD4FEFAA75060A72356871"><enum>(2)</enum><header>Critical material</header><text>The term <term>critical material</term> has the meaning given the term in section 7002(a) of the Energy Act of 2020 (<external-xref legal-doc="usc" parsable-cite="usc/30/1606">30 U.S.C. 1606(a)</external-xref>).</text></paragraph> ' +
      '<paragraph id="H072D3881A9BE45D281A558028154ACE1"><enum>(4)</enum><header display-inline="yes-display-inline">Eligible project</header><text>The term <term>eligible project</term> means a project that refines and processes or recycles raw critical materials into purified forms suitable for first-use applications.</text></paragraph></section>\n' +
      '<section id="HD275E8BBD53A41D7AE7749397EECAAEA"><enum>4.</enum><header>Domestic critical material processing pilot program</header>\n' +
      '<subsection id="HD46086FE551F47FEB13CC6E6FCF6CD13"><enum>(a)</enum><header>Establishment</header><text display-inline="yes-display-inline">Not later than 180 days after the date of enactment of this Act, the Secretary shall establish a pilot program, to be known as the <quote>Domestic Critical Material Processing Pilot Program</quote>, to support not fewer than 3 domestic critical material processing projects. </text></subsection></section></legis-body>';
    const text = billXmlToText(xml);
    expect(text).toContain("The term “critical material” has the meaning given");
    const bill = sources({ title: "Critical Materials Future Act of 2025", text });
    const check = (what: string, headline = "Energy Department pilot would back domestic mineral refining") =>
      checkSummary(summary({ headline, what_it_does: what, key_points: [{ text: "Starts a pilot program", section: null }] }), bill).blocking;
    expect(check("Would fund domestic critical material processing projects.")).toEqual([]);
    expect(check("Funds processing.", "This critical bill would fund mineral refining")).toEqual(['judging word "critical"']);
    // The `<term>x</term> means` form, without "The term" before it.
    const means = billXmlToText("<paragraph><enum>(3)</enum><header>Critical material</header><text><term>Critical material</term> means a material on the list.</text></paragraph>");
    const plural = billXmlToText("<text>The terms <term>critical material</term> and <term>critical mineral</term> have the meanings given those terms in section 2.</text>");
    expect(checkSummary(summary({ what_it_does: "Would fund critical material and critical mineral projects.", key_points: [{ text: "Starts a pilot", section: null }] }), sources({ text: plural })).blocking).toEqual([]);
    expect(means).toContain("“Critical material” means");
    expect(checkSummary(summary({ what_it_does: "Funds critical materials processing.", key_points: [{ text: "Starts a pilot", section: null }] }), sources({ text: means })).blocking).toEqual([]);
    // Without a definition, the same XML's header and pilot name do not exempt the word.
    const undefinedTerm = billXmlToText(xml.replace(/<paragraph id="H5DB[\s\S]*?<\/paragraph>/, ""));
    expect(checkSummary(summary({ what_it_does: "Would fund domestic critical material processing projects.", key_points: [{ text: "Starts a pilot", section: null }] }), sources({ text: undefinedTerm })).blocking).toEqual(['judging word "critical"']);
  });

  it("blocks a headline about the vote, which the page already shows", () => {
    const at = (headline: string) => checkSummary(summary({ headline }), sources()).blocking;
    expect(at("House votes to cancel California's harbor boat pollution rules")).toEqual(["headline mentions the vote"]);
    expect(at("Senate rejects plan to cap airline fees at the service cost")).toEqual(["headline mentions the vote"]);
    expect(at("Resolution would direct U.S. forces out of hostilities with Iran")).toEqual([]);
    expect(at("Bill would require House members to disclose stock trades")).toEqual([]);
    expect(at("Amendment to fix Supreme Court at nine justices fails in House")).toEqual(["headline mentions the vote"]);
    expect(at("House-passed bill would bar colleges from Israel boycotts")).toEqual(["headline mentions the vote"]);
    expect(at("Amendment would fix Supreme Court at nine justices; House rejected it")).toEqual(["headline mentions the vote"]);
    // Bills about congressional votes are about the change.
    expect(at("Resolution would require House votes on war powers")).toEqual([]);
    expect(at("Bill would require Congress approve any new tariffs")).toEqual([]);
  });

  it("checks who_it_affects for numbers and judging words like every other field", () => {
    const at = (who: string[]) => checkSummary(summary({ who_it_affects: who }), sources()).blocking;
    expect(at(["airline passengers", "airlines"])).toEqual([]);
    expect(at(["about 40 million airline passengers"])).toEqual(["number not in sources: 40000000"]);
    expect(at(["airlines with reckless fee practices"])).toEqual(['judging word "reckless"']);
    // A group never runs into the next field.
    expect(checkSummary(summary({ who_it_affects: ["airline passengers facing critical"], key_points: [{ text: "materials fees rise", section: null }] }), sources()).blocking).toEqual([
      'judging word "critical"',
    ]);
  });

  it("lets weather terms of art through, not 'extreme' as the summary's own judgment (HR 3106)", () => {
    const hr3106 = sources({
      title: "Weatherizing Infrastructure in the North and Terrorism Emergency Readiness Act of 2025",
      text: "SEC. 2. Exercise on terrorist attack during extreme cold\n(b) Exercise requirements\n(1)\nAn extreme cold weather event, such as an event caused by a polar vortex, with respect to access to critical services.",
    });
    const check = (what: string) =>
      checkSummary(summary({ headline: "DHS would rehearse a terror attack during a polar vortex", what_it_does: what, key_points: [{ text: "Runs one exercise", section: null }] }), hr3106).blocking;
    expect(check("Requires an exercise on a terrorist attack during an extreme cold weather event.")).toEqual([]);
    expect(check("Requires planning for extreme heat and extreme weather.")).toEqual([]);
    expect(check("Responds to extreme threats from terrorists.")).toEqual(['judging word "extreme"']);
    expect(check("Takes an extreme approach to cold-weather drills.")).toEqual(['judging word "extreme"']);
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
