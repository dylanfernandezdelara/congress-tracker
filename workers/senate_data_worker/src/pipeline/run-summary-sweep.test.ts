import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import type { DigestJob } from "../d1/digest-jobs";
import type { PreparedBill } from "../digest/prepare";

const jobsApi = vi.hoisted(() => ({
  closeDigestBatch: vi.fn(),
  enqueueDigestJobs: vi.fn(),
  insertDigestBatch: vi.fn(),
  insertDigestStubs: vi.fn(),
  markJobsBatched: vi.fn(),
  selectBatchJobs: vi.fn(),
  selectKnownBills: vi.fn(),
  selectOpenBatches: vi.fn(),
  selectQueuedJobs: vi.fn(),
  selectRecheckBills: vi.fn(),
  settleJob: vi.fn(),
}));
const mockGetDigest = vi.fn();
const mockGetState = vi.fn();
const mockSetState = vi.fn();
const mockBudgetLeft = vi.fn();
const mockRecordSpend = vi.fn();
const mockGetBatch = vi.fn();
const mockSubmitBatch = vi.fn();
const mockPrepare = vi.fn();
const mockStoreReply = vi.fn();
const mockCombine = vi.fn();
const mockWrite = vi.fn();
const mockFetchUpdated = vi.fn();

vi.mock("../d1/digest-jobs", () => jobsApi);
vi.mock("../d1/digests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../d1/digests")>()),
  getDigest: (...a: unknown[]) => mockGetDigest(...a),
}));
vi.mock("../d1/pipeline-state", () => ({
  getPipelineState: (...a: unknown[]) => mockGetState(...a),
  setPipelineState: (...a: unknown[]) => mockSetState(...a),
}));
vi.mock("../digest/budget", () => ({
  budgetLeft: (...a: unknown[]) => mockBudgetLeft(...a),
  recordSpend: (...a: unknown[]) => mockRecordSpend(...a),
}));
vi.mock("../digest/openrouter-client", () => ({
  getBatch: (...a: unknown[]) => mockGetBatch(...a),
  submitBatch: (...a: unknown[]) => mockSubmitBatch(...a),
}));
vi.mock("../digest/prepare", () => ({ prepareBill: (...a: unknown[]) => mockPrepare(...a) }));
vi.mock("../digest/write", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../digest/write")>()),
  storeReply: (...a: unknown[]) => mockStoreReply(...a),
  combineAndStore: (...a: unknown[]) => mockCombine(...a),
  writeSummary: (...a: unknown[]) => mockWrite(...a),
}));
vi.mock("../sources/updated-bills", () => ({ fetchUpdatedBillsPage: (...a: unknown[]) => mockFetchUpdated(...a) }));

import { runSummarySweep } from "./run-summary-sweep";

const NOW = new Date("2026-09-26T12:20:00.000Z");
const env = { CONGRESS: "119", SESSION: "2", DB: {} as D1Database, CONGRESS_API_KEY: "k", OPENROUTER_API_KEY: "k" } as Env;

const job = (number: number, overrides: Partial<DigestJob> = {}): DigestJob => ({
  congress: 119,
  type: "HR",
  number,
  tier: "new",
  matters: false,
  attempts: 0,
  batchId: null,
  fingerprint: null,
  ...overrides,
});

function prepared(number: number, overrides: Partial<PreparedBill> = {}): PreparedBill {
  return {
    ref: { congress: 119, type: "HR", number },
    input: {
      congress: 119,
      type: "HR",
      number,
      title: "A bill",
      sponsorName: null,
      status: { stage: "introduced", label: "Introduced" },
      committees: [],
      policyArea: null,
      votes: [],
      crs: null,
      textVersion: null,
      text: null,
    },
    parts: [],
    totalTokens: 0,
    basis: "title_only",
    checkSources: { type: "HR", title: "A bill", crsText: null, text: null, statusLabel: "Introduced — not law" },
    fingerprint: `fp${number}`,
    bundle: { title: "A bill", policyArea: null, rawSummaryText: null, introducedDate: null, sponsors: [] },
    ...overrides,
  };
}

const stored = { status: "stored", model: "m", cost: 0, warnings: [] };
const settled = () => jobsApi.settleJob.mock.calls.map((c) => [(c[1] as DigestJob).number, c[2]]);

describe("runSummarySweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(jobsApi)) fn.mockResolvedValue(undefined);
    jobsApi.selectOpenBatches.mockResolvedValue([]);
    jobsApi.selectQueuedJobs.mockResolvedValue([]);
    jobsApi.selectRecheckBills.mockResolvedValue([]);
    jobsApi.selectKnownBills.mockResolvedValue(new Set());
    mockGetState.mockResolvedValue(null);
    mockFetchUpdated.mockResolvedValue({ bills: [], hasMore: false });
    mockBudgetLeft.mockResolvedValue(1);
    mockGetDigest.mockResolvedValue(null);
    mockPrepare.mockImplementation(async (_env: Env, ref: { number: number }) => prepared(ref.number));
  });

  it("does nothing without an OpenRouter key", async () => {
    const result = await runSummarySweep({ ...env, OPENROUTER_API_KEY: "" }, { now: NOW });
    expect(result.warnings).toEqual(["OPENROUTER_API_KEY not set; summaries skipped"]);
    expect(jobsApi.selectOpenBatches).not.toHaveBeenCalled();
  });

  describe("collecting batches", () => {
    beforeEach(() => {
      jobsApi.selectOpenBatches.mockResolvedValue([{ id: "b1", model: "luna", requests: 3, submitted_at: "2026-09-26T11:20:00.000Z" }]);
    });

    it("waits for a batch that is still running", async () => {
      mockGetBatch.mockResolvedValue({ status: "in_progress", done: false, cost: null, results: [] });
      await runSummarySweep(env, { now: NOW, discover: false });
      expect(jobsApi.selectBatchJobs).not.toHaveBeenCalled();
    });

    it("stores passing replies, requeues changed bills, and writes rejected ones directly", async () => {
      mockGetBatch.mockResolvedValue({
        status: "completed",
        done: true,
        cost: 0.004,
        results: [1, 2, 3].map((n) => ({ customId: `119-hr-${n}:single`, content: `reply ${n}`, error: null, usage: {}, generationId: null })),
      });
      jobsApi.selectBatchJobs.mockResolvedValue([job(1, { fingerprint: "fp1" }), job(2, { fingerprint: "stale" }), job(3, { fingerprint: "fp3" })]);
      mockStoreReply.mockImplementation(async (_e, p: PreparedBill) =>
        p.ref.number === 1 ? stored : { status: "rejected", model: "m", cost: 0, reasons: ["number not in sources: 99"] }
      );
      mockWrite.mockResolvedValue({ ...stored, cost: 0.01 });

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockStoreReply.mock.calls.map((c) => [(c[1] as PreparedBill).ref.number, (c[2] as { content: string }).content])).toEqual([
        [1, "reply 1"],
        [3, "reply 3"],
      ]);
      expect(mockWrite).toHaveBeenCalledWith(env, expect.objectContaining({ fingerprint: "fp3" }), "new");
      expect(settled()).toEqual([
        [1, "done"],
        [2, "queued"],
        [3, "done"],
      ]);
      expect(mockRecordSpend).toHaveBeenCalledWith(env, 0.004);
      expect(jobsApi.closeDigestBatch).toHaveBeenCalledWith(env.DB, "b1", "collected", 0.004);
      expect(result).toMatchObject({ collected: 3, stored: 2, spentUsd: 0.014 });
    });

    it("combines a long bill's part notes from the batch", async () => {
      const parts = [
        { label: "Title I — A", text: "a", tokens: 20_000 },
        { label: "Title II — B", text: "b", tokens: 20_000 },
      ];
      mockPrepare.mockResolvedValue(prepared(1, { parts, totalTokens: 40_000, basis: "text" }));
      mockGetBatch.mockResolvedValue({
        status: "completed",
        done: true,
        cost: 0.01,
        results: [
          { customId: "119-hr-1:part0", content: '{"part":"A"}', error: null, usage: {}, generationId: null },
          { customId: "119-hr-1:part1", content: "not json", error: null, usage: {}, generationId: null },
        ],
      });
      jobsApi.selectBatchJobs.mockResolvedValue([job(1, { fingerprint: "fp1" })]);
      mockCombine.mockResolvedValue(stored);

      await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockCombine.mock.calls[0]![2]).toMatchObject({ tier: "new", notes: [{ part: "A" }] });
      expect(settled()).toEqual([[1, "done"]]);
    });

    it("requeues every bill of a batch that failed or expired", async () => {
      mockGetBatch.mockResolvedValue({ status: "in_progress", done: false, cost: null, results: [] });
      jobsApi.selectOpenBatches.mockResolvedValue([{ id: "b1", model: "luna", requests: 1, submitted_at: "2026-09-25T08:00:00.000Z" }]);
      jobsApi.selectBatchJobs.mockResolvedValue([job(1)]);

      await runSummarySweep(env, { now: NOW, discover: false });

      expect(settled()).toEqual([[1, "queued"]]);
      expect(jobsApi.closeDigestBatch).toHaveBeenCalledWith(env.DB, "b1", "failed", null);
    });
  });

  describe("discovery", () => {
    it("queues new bills and changed bills already on the site, and pages with a stable window", async () => {
      jobsApi.selectKnownBills.mockResolvedValue(new Set(["HR-2"]));
      mockFetchUpdated
        .mockResolvedValueOnce({
          bills: [
            { congress: 119, type: "HR", number: 1, title: "New bill", introducedDate: "2026-09-24" },
            { congress: 119, type: "HR", number: 2, title: "Known bill", introducedDate: "2025-02-01" },
            { congress: 119, type: "HR", number: 3, title: "Old unknown bill", introducedDate: "2025-03-01" },
          ],
          hasMore: true,
        })
        .mockResolvedValueOnce({ bills: [], hasMore: false });

      const result = await runSummarySweep(env, { now: NOW });

      expect(jobsApi.insertDigestStubs.mock.calls[0]![1].map((b: { number: number }) => b.number)).toEqual([1]);
      expect(jobsApi.enqueueDigestJobs.mock.calls[0]![1].map((b: { number: number }) => b.number)).toEqual([1, 2]);
      expect(result.discovered).toBe(2);
      const first = mockFetchUpdated.mock.calls[0]![1];
      const second = mockFetchUpdated.mock.calls[1]![1];
      expect(second).toMatchObject({ fromIso: first.fromIso, toIso: first.toIso, offset: 3 });
      // The window is exhausted: the next one starts 36 hours before this one ended.
      expect(mockSetState).toHaveBeenCalledWith(env.DB, "digest_discovery_cursor", {
        fromIso: "2026-09-25T00:20:00.000Z",
        toIso: NOW.toISOString(),
        offset: 0,
      });
    });
  });

  describe("the queue", () => {
    it("rewrites bills that matter, skipping ones already current", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(async (_db, { matters }: { matters: boolean }) =>
        matters ? [job(1, { matters: true }), job(2, { matters: true }), job(3, { matters: true })] : []
      );
      const rewritten = (fingerprint: string) => ({
        digest_json: JSON.stringify({ headline: "h", what_it_does: "w", generator: { tier: "rewrite", fingerprint, long: false } }),
      });
      // 1 is current; 2 has no summary; 3 was rewritten from inputs that have since changed.
      mockGetDigest.mockImplementation(async (_db, _c, _t, n: number) => (n === 1 ? rewritten("fp1") : n === 3 ? rewritten("old") : null));
      mockWrite.mockResolvedValue({ ...stored, cost: 0.015 });

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockWrite.mock.calls.map((c) => (c[1] as PreparedBill).fingerprint)).toEqual(["fp2", "fp3"]);
      expect(settled()).toEqual([
        [1, "done"],
        [2, "done"],
        [3, "done"],
      ]);
      expect(result).toMatchObject({ unchanged: 1, rewritten: 2 });
    });

    it("stops rewriting when the day's budget is spent", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(async (_db, { matters }: { matters: boolean }) => (matters ? [job(1, { matters: true })] : []));
      mockBudgetLeft.mockResolvedValue(0);

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockWrite).not.toHaveBeenCalled();
      expect(result.warnings).toContain("daily summary budget spent; rewrites resume tomorrow");
    });

    it("sends other bills to one Luna batch, one request per bill or part", async () => {
      const parts = [
        { label: "Title I — A", text: "a", tokens: 20_000 },
        { label: "Title II — B", text: "b", tokens: 20_000 },
      ];
      jobsApi.selectQueuedJobs.mockImplementation(async (_db, { matters }: { matters: boolean }) => (matters ? [] : [job(1), job(2), job(3, { attempts: 3 })]));
      mockPrepare.mockImplementation(async (_e, ref: { number: number }) =>
        ref.number === 2 ? prepared(2, { parts, totalTokens: 40_000, basis: "text" }) : prepared(ref.number)
      );
      mockSubmitBatch.mockResolvedValue("batch-9");
      mockWrite.mockResolvedValue(stored);

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      const [, model, requests] = mockSubmitBatch.mock.calls[0]!;
      expect(model).toMatchObject({ id: "openai/gpt-6-luna", batch: true });
      expect(requests.map((r: { customId: string }) => r.customId)).toEqual(["119-hr-1:single", "119-hr-2:part0", "119-hr-2:part1"]);
      expect(jobsApi.markJobsBatched.mock.calls[0]![1]).toEqual([
        { ref: { congress: 119, type: "HR", number: 1 }, fingerprint: "fp1" },
        { ref: { congress: 119, type: "HR", number: 2 }, fingerprint: "fp2" },
      ]);
      // A bill whose batches keep failing is written directly.
      expect(mockWrite).toHaveBeenCalledWith(env, expect.objectContaining({ fingerprint: "fp3" }), "new");
      expect(result.batched).toBe(2);
    });
  });
});
