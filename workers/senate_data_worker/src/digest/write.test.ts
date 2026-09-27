import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import type { PreparedBill } from "./prepare";

const mockChat = vi.fn();
const mockUpsert = vi.fn();
const mockBudgetLeft = vi.fn();
const mockRecordSpend = vi.fn();

vi.mock("./openrouter-client", () => ({ chatCompletion: (...args: unknown[]) => mockChat(...args) }));
vi.mock("../d1/digests", () => ({ upsertDigest: (...args: unknown[]) => mockUpsert(...args) }));
vi.mock("./budget", () => ({
  budgetLeft: (...args: unknown[]) => mockBudgetLeft(...args),
  recordSpend: (...args: unknown[]) => mockRecordSpend(...args),
}));

import { writeSummary } from "./write";

const env = { DB: {} as D1Database } as Env;
const SONNET = "anthropic/claude-sonnet-5";
const LUNA = "openai/gpt-6-luna";

function prepared(overrides: Partial<PreparedBill> = {}): PreparedBill {
  return {
    ref: { congress: 119, type: "HR", number: 1 },
    input: {
      congress: 119,
      type: "HR",
      number: 1,
      title: "Airline Fee Fairness Act",
      sponsorName: null,
      status: { stage: "introduced", label: "Introduced" },
      committees: [],
      policyArea: null,
      votes: [],
      crs: null,
      textVersion: { type: "Introduced in House", date: "2026-09-01" },
      text: "SEC. 2. Fees\nCaps fees at $45,000,000,000.",
    },
    parts: [],
    totalTokens: 100,
    basis: "text",
    checkSources: { type: "HR", title: "Airline Fee Fairness Act", crsText: null, text: "SEC. 2. Fees\nCaps fees at $45,000,000,000.", statusLabel: "Introduced — not law" },
    fingerprint: "fp1",
    bundle: { title: "Airline Fee Fairness Act", policyArea: null, rawSummaryText: null, introducedDate: null, sponsors: [] },
    ...overrides,
  };
}

const good = JSON.stringify({
  headline: "Bill would cap airline fees at what the service costs",
  what_it_does: "Caps airline fees.",
  key_points: [{ text: "Caps fees at $45 billion", section: "Sec. 2" }],
});
const invented = JSON.stringify({
  headline: "Bill would cap airline fees at $60 billion",
  what_it_does: "Caps airline fees.",
  key_points: [{ text: "Caps fees", section: null }],
});
const reply = (content: string | null, cost = 0.01) => ({ content, usage: { cost, promptTokens: 1, completionTokens: 1 }, generationId: "g" });
const modelOf = (call: number) => (mockChat.mock.calls[call]![1] as { id: string }).id;

describe("writeSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBudgetLeft.mockResolvedValue(1);
  });

  it("writes a rewrite with Sonnet and stores it with its provenance", async () => {
    mockChat.mockResolvedValue(reply(good));

    const outcome = await writeSummary(env, prepared(), "rewrite");

    expect(outcome).toMatchObject({ status: "stored", model: SONNET, cost: 0.01 });
    expect(modelOf(0)).toBe(SONNET);
    const stored = mockUpsert.mock.calls[0]![1].digest;
    expect(stored.basis).toBe("text");
    expect(stored.generator).toMatchObject({ model: SONNET, prompt_version: "v3", tier: "rewrite", fingerprint: "fp1", long: false });
    expect(mockRecordSpend).toHaveBeenCalledWith(env, 0.01);
  });

  it("retries a reply the checks reject with the other model, and keeps the bill's summary if both fail", async () => {
    mockChat.mockResolvedValueOnce(reply(invented)).mockResolvedValueOnce(reply(good, 0.001));

    const outcome = await writeSummary(env, prepared(), "rewrite");

    expect([modelOf(0), modelOf(1)]).toEqual([SONNET, LUNA]);
    expect(outcome).toMatchObject({ status: "stored", model: LUNA, cost: 0.011 });

    vi.clearAllMocks();
    mockBudgetLeft.mockResolvedValue(1);
    mockChat.mockResolvedValue(reply(invented));
    const failed = await writeSummary(env, prepared(), "new");
    expect(failed).toMatchObject({ status: "rejected", reasons: ["number not in sources: 60000000000"] });
    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("reads a long bill part by part with Luna, then combines; a rejected combine is retried alone", async () => {
    const parts = [
      { label: "Title I — Fees", text: "SEC. 101. Fees\nCaps fees at $45,000,000,000.", tokens: 20_000 },
      { label: "Title II — Reports", text: "SEC. 201. Reports\nA report.", tokens: 20_000 },
    ];
    const long = prepared({
      parts,
      totalTokens: 40_000,
      input: { ...prepared().input, text: null },
      checkSources: { ...prepared().checkSources, text: parts.map((p) => p.text).join("\n\n") },
    });
    const note = JSON.stringify({ part: "Fees", summary: "Caps fees", changes: [] });
    const combined = JSON.stringify({
      headline: "Law caps airline fees and requires reports",
      what_it_does: "Caps fees.",
      key_points: [{ text: "Caps fees at $45 billion", section: "Sec. 101" }],
      inside: [{ part: "Fees", summary: "Caps fees", section: "Title I" }],
    });
    mockChat
      .mockResolvedValueOnce(reply(note))
      .mockResolvedValueOnce(reply(note))
      .mockResolvedValueOnce(reply(invented))
      .mockResolvedValueOnce(reply(combined));

    const outcome = await writeSummary(env, long, "rewrite");

    expect(mockChat.mock.calls.map((_, i) => modelOf(i))).toEqual([LUNA, LUNA, LUNA, SONNET]);
    expect(outcome.status).toBe("stored");
    const stored = mockUpsert.mock.calls[0]![1].digest;
    expect(stored.generator.long).toBe(true);
    expect(stored.inside[0].share).toBe(50);
  });

  it("does nothing once the day's budget is spent", async () => {
    mockBudgetLeft.mockResolvedValue(0);

    expect(await writeSummary(env, prepared(), "rewrite")).toEqual({ status: "over_budget", cost: 0 });
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("reports a provider failure without storing anything", async () => {
    mockChat.mockRejectedValue(new Error("HTTP 502"));

    expect(await writeSummary(env, prepared(), "new")).toEqual({ status: "failed", cost: 0, reason: "HTTP 502" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
