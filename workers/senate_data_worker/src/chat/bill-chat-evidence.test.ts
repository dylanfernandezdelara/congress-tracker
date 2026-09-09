import { describe, expect, it, vi } from "vitest";

import type { BillDigestContent } from "../../../../shared/digest-api-types";
import { cleanQuoteText, findQuoteSource } from "../../../../shared/quote-verification";
import type { DigestRow } from "../d1/digests";
import type { BillTextSectionRow } from "../d1/bill-text-sections";
import {
  buildEvidenceChunks,
  findChunkForQuote,
  formatSectionLabel,
  loadBillEvidence,
  selectEvidence,
} from "./bill-chat-evidence";

const digest: BillDigestContent = {
  headline: "House passes a permitting package",
  what_it_does: "Speeds energy permits across states.",
  key_points: ["Caps environmental review at two years"],
  terms_explained: [{ term: "NEPA", plain: "The main environmental review law" }],
};

function section(
  ordinal: number,
  label: string,
  heading: string,
  body: string
): BillTextSectionRow {
  return { ordinal, label, heading, body };
}

describe("buildEvidenceChunks", () => {
  it("builds digest, CRS, and section chunks with collapsed whitespace", () => {
    const chunks = buildEvidenceChunks({
      digest,
      crsSummary: "This bill  directs the Secretary   of Energy.",
      sections: [section(0, "3.", "Definitions", "  A  widget   is a device. ")],
    });
    expect(chunks.map((c) => ({ id: c.id, source: c.source, label: c.section_label }))).toEqual([
      { id: "digest", source: "digest", label: "Plain-English summary" },
      { id: "crs", source: "crs", label: "CRS summary" },
      { id: "bill_text-0", source: "bill_text", label: "Sec. 3. Definitions" },
    ]);
    expect(chunks[2]!.text).toBe("A widget is a device.");
    // Digest evidence is the selectable summary text (what it does + key
    // points), the same fields `POST /share/quote` verifies against.
    expect(chunks[0]!.text).toContain("Speeds energy permits across states.");
    expect(chunks[0]!.text).toContain("Caps environmental review at two years");
    expect(chunks[0]!.text).not.toContain("House passes a permitting package");
  });

  it("skips empty sources and formats labels without a heading", () => {
    const chunks = buildEvidenceChunks({
      digest: null,
      crsSummary: "   ",
      sections: [section(1, "2.", "", "Only the body.")],
    });
    expect(chunks).toEqual([
      {
        id: "bill_text-1",
        source: "bill_text",
        section_label: "Sec. 2",
        text: "Only the body.",
      },
    ]);
  });

  it("formats stored enums as Sec. N. Heading", () => {
    expect(formatSectionLabel("3.", "Definitions")).toBe("Sec. 3. Definitions");
    expect(formatSectionLabel("Sec. 3", "Definitions")).toBe("Sec. 3. Definitions");
    expect(formatSectionLabel("Sec. 3.", "Definitions")).toBe("Sec. 3. Definitions");
  });
});

describe("selectEvidence", () => {
  const sections = [
    section(0, "1.", "Short title", "This Act may be cited as the Widget Act."),
    section(1, "2.", "Findings", "Congress finds that widgets improve safety."),
    section(2, "3.", "Definitions", "The term widget means a safety device."),
  ];
  const all = buildEvidenceChunks({
    digest,
    crsSummary: "CRS notes the widget definition.",
    sections,
  });

  it("always includes digest and CRS first, then ranks matching sections", () => {
    const selected = selectEvidence(all, "the term widget means", { maxChars: 24_000 });
    expect(selected[0]!.source).toBe("digest");
    expect(selected[1]!.source).toBe("crs");
    // "widgets" in the findings section does not match the query token "widget".
    expect(selected.filter((c) => c.source === "bill_text").map((c) => c.id)).toEqual([
      "bill_text-2",
      "bill_text-0",
    ]);
    const labels = selected.filter((c) => c.source === "bill_text").map((c) => c.section_label);
    expect(labels[0]).toBe("Sec. 3. Definitions");
  });

  it("truncates ranked sections to the character budget", () => {
    const digestCrs = all.filter((c) => c.source !== "bill_text");
    const used = digestCrs.reduce((n, c) => n + c.text.length, 0);
    const selected = selectEvidence(all, "the term widget means", {
      maxChars: used + all.find((c) => c.id === "bill_text-2")!.text.length,
    });
    expect(selected.filter((c) => c.source === "bill_text")).toHaveLength(1);
    expect(selected.at(-1)!.section_label).toBe("Sec. 3. Definitions");
  });

  it("falls back to ordinal order when no section matches", () => {
    const selected = selectEvidence(all, "zzzz unrelated query", { maxChars: 24_000 });
    expect(selected.filter((c) => c.source === "bill_text").map((c) => c.id)).toEqual([
      "bill_text-0",
      "bill_text-1",
      "bill_text-2",
    ]);
  });
});

describe("findChunkForQuote", () => {
  const chunks = buildEvidenceChunks({
    digest,
    crsSummary: null,
    sections: [section(0, "3.", "Definitions", 'A “widget” is a device.')],
  });

  it("returns the evidence slice with original casing", () => {
    const found = findChunkForQuote(chunks, "speeds energy PERMITS");
    expect(found?.chunk.source).toBe("digest");
    expect(found?.displayText).toBe("Speeds energy permits");
  });

  it("tolerates curly quotes and returns the chunk's own typography as the display text", () => {
    const found = findChunkForQuote(chunks, 'a "widget" is a device');
    expect(found?.chunk.source).toBe("bill_text");
    expect(found?.displayText).toBe("A “widget” is a device");
  });

  it("accepts exactly the passages POST /share/quote accepts (lockstep with findQuoteSource)", () => {
    const passages = ['a "widget" is a device.', "Caps environmental review at two years", "SPEEDS ENERGY   permits"];
    for (const passage of passages) {
      const shared = findQuoteSource(cleanQuoteText(passage), chunks);
      const chat = findChunkForQuote(chunks, passage);
      expect(chat?.chunk.id, passage).toBe(shared?.id);
    }
  });

  it("returns null when the quote is not in any chunk", () => {
    expect(findChunkForQuote(chunks, "this sentence is not in the bill")).toBeNull();
  });

  it("prefers the chunk named by the section hint when the passage appears in several", () => {
    const shared = "The Secretary shall publish an annual report.";
    const overlapping = buildEvidenceChunks({
      digest: { ...digest, what_it_does: shared },
      crsSummary: shared,
      sections: [section(4, "5.", "Reporting", shared)],
    });
    expect(findChunkForQuote(overlapping, shared)?.chunk.id).toBe("digest");
    expect(findChunkForQuote(overlapping, shared, "Sec. 5. Reporting")?.chunk.id).toBe("bill_text-4");
    expect(findChunkForQuote(overlapping, shared, "sec. 5. reporting")?.chunk.id).toBe("bill_text-4");
    expect(findChunkForQuote(overlapping, shared, "CRS summary")?.chunk.id).toBe("crs");
  });

  it("still searches every chunk when the section hint names a block the passage is not in", () => {
    const found = findChunkForQuote(chunks, "speeds energy permits", "Sec. 3. Definitions");
    expect(found?.chunk.source).toBe("digest");
    expect(findChunkForQuote(chunks, "speeds energy permits", "Sec. 99. Nonexistent")?.chunk.id).toBe("digest");
  });
});

describe("loadBillEvidence", () => {
  it("returns null when the digest row is missing", async () => {
    const db = {
      exec: vi.fn(async () => {}),
      prepare() {
        const stmt = {
          bind: () => stmt,
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        };
        return stmt;
      },
    } as unknown as D1Database;
    await expect(
      loadBillEvidence({ DB: db }, { congress: 119, type: "hr", number: 1 })
    ).resolves.toBeNull();
  });

  it("joins digest, CRS, and stored sections", async () => {
    const digestRow: DigestRow = {
      congress: 119,
      bill_type: "HR",
      number: 1,
      title: "Widget Act",
      policy_area: null,
      raw_summary_text: "CRS summary text here.",
      digest_json: JSON.stringify(digest),
    };
    const db = {
      exec: vi.fn(async () => {}),
      prepare(sql: string) {
        const stmt = {
          bind: () => stmt,
          first: async () => {
            if (sql.includes("FROM bill_digests")) return digestRow;
            if (sql.includes("FROM bill_text_documents")) {
              return { fetched_at: "2026-09-01T00:00:00.000Z" };
            }
            return null;
          },
          all: async () => {
            if (sql.includes("FROM bill_text_sections")) {
              return { results: [section(0, "1.", "Short title", "This Act may be cited.")] };
            }
            return { results: [] };
          },
          run: async () => ({ success: true }),
        };
        return stmt;
      },
    } as unknown as D1Database;
    const loaded = await loadBillEvidence({ DB: db }, { congress: 119, type: "hr", number: 1 });
    expect(loaded?.title).toBe("Widget Act");
    expect(loaded?.chunks.map((c) => c.source)).toEqual(["digest", "crs", "bill_text"]);
  });
});
