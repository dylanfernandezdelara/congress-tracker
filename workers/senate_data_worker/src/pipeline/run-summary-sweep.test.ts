import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import type { DigestJob } from "../d1/digest-jobs";
import type { PreparedBill } from "../digest/prepare";

const jobsApi = vi.hoisted(() => ({
  closeDigestBatch: vi.fn(),
  enqueueDigestJobs: vi.fn(),
  insertDigestBatch: vi.fn(),
  insertDigestStubs: vi.fn(),
  markAttempt: vi.fn(),
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
const mockCancelBatch = vi.fn();
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
  AccountError: class AccountError extends Error {},
  getBatch: (...a: unknown[]) => mockGetBatch(...a),
  submitBatch: (...a: unknown[]) => mockSubmitBatch(...a),
  cancelBatch: (...a: unknown[]) => mockCancelBatch(...a),
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
  readFailures: 0,
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

const SONNET = "anthropic/claude-sonnet-5";
const settled = () => jobsApi.settleJob.mock.calls.map((c) => [(c[1] as DigestJob).number, c[2]]);
const settledWith = () => jobsApi.settleJob.mock.calls.map((c) => [(c[1] as DigestJob).number, c[2], c[3]]);
const openBatch = (overrides: Record<string, unknown> = {}) => ({
  id: "b1",
  model: "luna",
  requests: 3,
  submitted_at: "2026-09-26T11:20:00.000Z",
  cost: 0.003,
  ...overrides,
});
const item = (customId: string, content: string | null) => ({ customId, content, error: null, usage: { cost: 0 }, generationId: null });
const onlyMatters = (jobs: DigestJob[]) => async (_db: unknown, { matters }: { matters: boolean }) => (matters ? jobs : []);
const onlyNew = (jobs: DigestJob[]) => async (_db: unknown, { matters }: { matters: boolean }) => (matters ? [] : jobs);
const longParts = [
  { label: "Title I — A", text: "a", tokens: 20_000 },
  { label: "Title II — B", text: "b", tokens: 20_000 },
];

describe("runSummarySweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(jobsApi)) fn.mockResolvedValue(undefined);
    jobsApi.selectOpenBatches.mockResolvedValue([]);
    jobsApi.selectQueuedJobs.mockResolvedValue([]);
    jobsApi.selectBatchJobs.mockResolvedValue([]);
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
    beforeEach(() => jobsApi.selectOpenBatches.mockResolvedValue([openBatch()]));

    it("waits for a batch that is still running", async () => {
      mockGetBatch.mockResolvedValue({ status: "in_progress", done: false, cost: null, results: [] });
      await runSummarySweep(env, { now: NOW, discover: false });
      expect(jobsApi.selectBatchJobs).not.toHaveBeenCalled();
    });

    it("stores passing replies, requeues changed bills, and sends rejected ones straight to the other model", async () => {
      mockGetBatch.mockResolvedValue({
        status: "completed",
        done: true,
        cost: 0.004,
        results: [1, 2, 3].map((n) => item(`119-hr-${n}:single`, `reply ${n}`)),
      });
      jobsApi.selectBatchJobs.mockResolvedValue([job(1, { fingerprint: "fp1", attempts: 1 }), job(2, { fingerprint: "stale" }), job(3, { fingerprint: "fp3", attempts: 1 })]);
      mockStoreReply.mockImplementation(async (_e, p: PreparedBill) =>
        p.ref.number === 1 ? stored : { status: "rejected", model: "m", cost: 0, reasons: ["number not in sources: 99"] }
      );
      mockWrite.mockResolvedValue({ ...stored, cost: 0.01 });

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockStoreReply.mock.calls.map((c) => [(c[1] as PreparedBill).ref.number, (c[2] as { content: string }).content])).toEqual([
        [1, "reply 1"],
        [3, "reply 3"],
      ]);
      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(mockWrite.mock.calls[0]![3]).toMatchObject({ model: { id: SONNET }, retry: false });
      // The paid try is counted before the call.
      expect(jobsApi.markAttempt).toHaveBeenCalledWith(env.DB, expect.objectContaining({ number: 3 }), "fp3", 2);
      expect(jobsApi.markAttempt.mock.invocationCallOrder[0]).toBeLessThan(mockWrite.mock.invocationCallOrder[0]!);
      expect(settled()).toEqual([
        [1, "done"],
        [2, "queued"],
        [3, "done"],
      ]);
      // The $0.003 estimate was counted at submit; only the difference is recorded now.
      expect(jobsApi.closeDigestBatch).toHaveBeenCalledWith(env.DB, "b1", "collected", 0.004);
      expect(mockRecordSpend).toHaveBeenCalledTimes(1);
      expect(mockRecordSpend.mock.calls[0]![1]).toBeCloseTo(0.001, 6);
      expect(result).toMatchObject({ collected: 3, stored: 2, spentUsd: 0.014 });
    });

    it("combines a long bill's batch notes, and retries only the combine with the other model", async () => {
      mockPrepare.mockResolvedValue(prepared(1, { parts: longParts, totalTokens: 40_000, basis: "text" }));
      mockGetBatch.mockResolvedValue({
        status: "completed",
        done: true,
        cost: 0.01,
        results: [item("119-hr-1:part0", '{"part":"A"}'), item("119-hr-1:part1", '{"part":"B"}')],
      });
      jobsApi.selectBatchJobs.mockResolvedValue([job(1, { fingerprint: "fp1", attempts: 1, matters: true })]);
      mockCombine
        .mockResolvedValueOnce({ status: "rejected", model: "luna", cost: 0.002, reasons: ["number not in sources: 31905000000"] })
        .mockResolvedValueOnce({ ...stored, cost: 0.02 });

      await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockCombine.mock.calls.map((c) => (c[2] as { model: { id: string } }).model.id)).toEqual(["openai/gpt-6-luna", SONNET]);
      expect(mockCombine.mock.calls[1]![2]).toMatchObject({ tier: "rewrite", notes: [{ part: "A" }, { part: "B" }], priorCost: 0.002 });
      expect(mockWrite).not.toHaveBeenCalled();
      expect(settled()).toEqual([[1, "done"]]);
    });

    it("counts a combine that throws as a failed try on the bill's own inputs, so repeats still park it", async () => {
      mockPrepare.mockResolvedValue(prepared(1, { parts: longParts, totalTokens: 40_000, basis: "text" }));
      mockGetBatch.mockResolvedValue({
        status: "completed",
        done: true,
        cost: 0.01,
        results: [item("119-hr-1:part0", '{"part":"A"}'), item("119-hr-1:part1", '{"part":"B"}')],
      });
      jobsApi.selectBatchJobs.mockResolvedValue([job(1, { fingerprint: "fp1", attempts: 2 })]);
      mockCombine.mockRejectedValue(new Error("The operation was aborted due to timeout"));

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(jobsApi.markAttempt).toHaveBeenCalledWith(env.DB, expect.objectContaining({ number: 1 }), "fp1", 3);
      expect(settledWith()).toEqual([
        [1, "done", expect.objectContaining({ fingerprint: "fp1", attempts: 3, error: "The operation was aborted due to timeout" })],
      ]);
      expect(result.failed).toBe(1);
    });

    it("leaves bills in an open batch when the run has no write capacity left", async () => {
      mockPrepare.mockResolvedValue(prepared(1, { parts: longParts, totalTokens: 40_000, basis: "text" }));
      mockGetBatch.mockResolvedValue({ status: "completed", done: true, cost: 0.01, results: [] });
      jobsApi.selectBatchJobs.mockResolvedValue([job(1, { fingerprint: "fp1" })]);

      await runSummarySweep(env, { now: NOW, discover: false, syncWrites: 0 });

      expect(mockCombine).not.toHaveBeenCalled();
      expect(jobsApi.settleJob).not.toHaveBeenCalled();
      expect(jobsApi.closeDigestBatch).not.toHaveBeenCalled();
    });

    it("requeues every bill of a batch that failed or expired, cancels it, and refunds the unspent estimate", async () => {
      mockGetBatch.mockResolvedValue({ status: "in_progress", done: false, cost: null, results: [] });
      jobsApi.selectOpenBatches.mockResolvedValue([openBatch({ submitted_at: "2026-09-25T08:00:00.000Z" })]);
      jobsApi.selectBatchJobs.mockResolvedValue([job(1)]);

      await runSummarySweep(env, { now: NOW, discover: false });

      expect(settled()).toEqual([[1, "queued"]]);
      expect(mockCancelBatch).toHaveBeenCalledWith(env, "b1");
      expect(jobsApi.closeDigestBatch).toHaveBeenCalledWith(env.DB, "b1", "failed", 0);
      expect(mockRecordSpend.mock.calls[0]![1]).toBeCloseTo(-0.003, 6);
    });

    it("frees the bills of an expired batch whose status can no longer be read", async () => {
      mockGetBatch.mockRejectedValue(new Error("batch status failed: HTTP 404"));
      jobsApi.selectOpenBatches.mockResolvedValue([openBatch({ submitted_at: "2026-09-25T08:00:00.000Z" })]);
      jobsApi.selectBatchJobs.mockResolvedValue([job(1)]);

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(settled()).toEqual([[1, "queued"]]);
      // Unknown charge: the estimate stands.
      expect(jobsApi.closeDigestBatch).toHaveBeenCalledWith(env.DB, "b1", "failed", 0.003);
      expect(result.warnings).toContain("batch b1 unreadable; 1 bill(s) requeued");
    });
  });

  describe("discovery", () => {
    it("queues new bills and changed bills already on the site, and pages with a stable window", async () => {
      jobsApi.selectKnownBills.mockResolvedValue(new Set(["HR-2"]));
      mockFetchUpdated
        .mockResolvedValueOnce({
          bills: [
            { congress: 119, type: "HR", number: 1, title: "New bill", introducedDate: "2026-09-24", changedOn: "2026-09-26" },
            { congress: 119, type: "HR", number: 2, title: "Known bill", introducedDate: "2025-02-01", changedOn: "2026-09-25" },
            { congress: 119, type: "HR", number: 3, title: "Old unknown bill", introducedDate: "2025-03-01", changedOn: "2026-09-26" },
          ],
          hasMore: true,
        })
        .mockResolvedValueOnce({ bills: [], hasMore: false });

      const result = await runSummarySweep(env, { now: NOW });

      expect(jobsApi.insertDigestStubs.mock.calls[0]![1].map((b: { number: number }) => b.number)).toEqual([1]);
      const queued = jobsApi.enqueueDigestJobs.mock.calls[0]![1] as Array<{ number: number; changedOn: string }>;
      expect(queued.map((b) => [b.number, b.changedOn])).toEqual([
        [1, "2026-09-26"],
        [2, "2026-09-25"],
      ]);
      expect(result.discovered).toBe(2);
      const first = mockFetchUpdated.mock.calls[0]![1];
      const second = mockFetchUpdated.mock.calls[1]![1];
      expect(second).toMatchObject({ fromIso: first.fromIso, toIso: first.toIso, offset: 3 });
      // The window is exhausted: the next one starts 3 hours before this one ended.
      expect(mockSetState).toHaveBeenCalledWith(env.DB, "digest_discovery_cursor", {
        fromIso: "2026-09-26T09:20:00.000Z",
        toIso: NOW.toISOString(),
        offset: 0,
      });
    });
  });

  describe("the queue", () => {
    it("rewrites bills that matter; unchanged ones do not use up the run's writes", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(onlyMatters([job(1, { matters: true }), job(2, { matters: true }), job(3, { matters: true })]));
      const rewritten = (fingerprint: string) => ({
        digest_json: JSON.stringify({ headline: "h", what_it_does: "w", generator: { tier: "rewrite", fingerprint, long: false } }),
      });
      // 1 is current; 2 was rewritten from inputs that have since changed; 3 has no summary.
      mockGetDigest.mockImplementation(async (_db, _c, _t, n: number) => (n === 1 ? rewritten("fp1") : n === 2 ? rewritten("old") : null));
      mockWrite.mockResolvedValue({ ...stored, cost: 0.015 });

      const result = await runSummarySweep(env, { now: NOW, discover: false, rewrites: 1 });

      expect(mockWrite.mock.calls.map((c) => (c[1] as PreparedBill).fingerprint)).toEqual(["fp2"]);
      expect(settled()).toEqual([
        [1, "done"],
        [2, "done"],
      ]);
      expect(result).toMatchObject({ unchanged: 1, rewritten: 1 });
    });

    it("sends long bills that matter to the Luna batch instead of a slow direct write", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(onlyMatters([job(1, { matters: true })]));
      mockPrepare.mockResolvedValue(prepared(1, { parts: longParts, totalTokens: 40_000, basis: "text" }));
      mockSubmitBatch.mockResolvedValue("batch-2");

      await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockWrite).not.toHaveBeenCalled();
      expect(mockSubmitBatch.mock.calls[0]![2].map((r: { customId: string }) => r.customId)).toEqual(["119-hr-1:part0", "119-hr-1:part1"]);
    });

    it("counts a paid try before it starts, and parks the bill at the third failure", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(
        onlyMatters([job(1, { matters: true, attempts: 0, fingerprint: "fp1" }), job(2, { matters: true, attempts: 2, fingerprint: "fp2" })])
      );
      mockWrite.mockResolvedValue({ status: "rejected", model: "m", cost: 0.05, reasons: ["number not in sources: 31905000000"] });

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(jobsApi.markAttempt.mock.calls.map((c) => [(c[1] as DigestJob).number, c[2], c[3]])).toEqual([
        [1, "fp1", 1],
        [2, "fp2", 3],
      ]);
      expect(settledWith().map(([n, state, p]) => [n, state, (p as { attempts: number }).attempts])).toEqual([
        [1, "queued", 1],
        [2, "done", 3],
      ]);
      expect(result.warnings).toContain("H.R. 2 · 119th Congress: rejected: number not in sources: 31905000000");
      expect(result.spentUsd).toBe(0.1);
    });

    it("skips a parked bill without paying, and counts unreadable bills apart from failed summaries", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(
        onlyMatters([job(1, { matters: true, attempts: 3, fingerprint: "fp1" }), job(2, { matters: true, attempts: 2, fingerprint: "fp2", readFailures: 2 })])
      );
      mockPrepare.mockImplementation(async (_e, ref: { number: number }) => {
        if (ref.number === 2) throw new Error("HTTP 503");
        return prepared(ref.number);
      });

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockWrite).not.toHaveBeenCalled();
      expect(result.parked).toBe(1);
      // The third unreadable run parks it; its summary attempts and fingerprint are left as they were.
      const [, state, params] = settledWith()[1]!;
      expect(state).toBe("done");
      expect(params).toEqual({ error: "parked: unreadable 3 times: HTTP 503", readFailures: 3 });
    });

    it("does not count a refusing OpenRouter account against the bill, and stops direct writes", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(
        onlyMatters([job(1, { matters: true, attempts: 2, fingerprint: "fp1" }), job(2, { matters: true })])
      );
      mockWrite.mockResolvedValue({ status: "failed", cost: 0, reason: "OpenRouter account: Insufficient credits", account: true });

      await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(settledWith()).toEqual([[1, "queued", expect.objectContaining({ fingerprint: "fp1", attempts: 2 })]]);
    });

    it("stops rewriting when the day's budget is spent", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(onlyMatters([job(1, { matters: true })]));
      mockBudgetLeft.mockResolvedValue(0);

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockWrite).not.toHaveBeenCalled();
      expect(result.warnings).toContain("daily summary budget spent; rewrites resume tomorrow");
    });

    it("sends other bills to one Luna batch and counts its estimated cost now", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(
        onlyNew([
          job(1),
          job(2),
          job(3, { attempts: 2, fingerprint: "fp3" }),
          job(4, { attempts: 3, fingerprint: "fp4" }),
          job(5, { attempts: 3, fingerprint: "changed" }),
        ])
      );
      mockPrepare.mockImplementation(async (_e, ref: { number: number }) =>
        ref.number === 2 ? prepared(2, { parts: longParts, totalTokens: 40_000, basis: "text" }) : prepared(ref.number)
      );
      mockSubmitBatch.mockResolvedValue("batch-9");
      mockWrite.mockResolvedValue(stored);

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      const [, model, requests] = mockSubmitBatch.mock.calls[0]!;
      expect(model).toMatchObject({ id: "openai/gpt-6-luna", reasoning: { effort: "high" } });
      // 5 failed before, but on inputs that have since changed, so it gets a fresh try.
      expect(requests.map((r: { customId: string }) => r.customId)).toEqual(["119-hr-1:single", "119-hr-2:part0", "119-hr-2:part1", "119-hr-5:single"]);
      expect(jobsApi.markJobsBatched.mock.calls[0]![1].map((j: { fingerprint: string }) => j.fingerprint)).toEqual(["fp1", "fp2", "fp5"]);
      const estimate = jobsApi.insertDigestBatch.mock.calls[0]![1].estimate as number;
      expect(estimate).toBeGreaterThan(0.001);
      expect(mockRecordSpend).toHaveBeenCalledWith(env, estimate);
      // A bill whose batches keep failing is written directly; 4 failed three times on these inputs and is parked.
      expect(mockWrite).toHaveBeenCalledTimes(1);
      expect(mockWrite).toHaveBeenCalledWith(env, expect.objectContaining({ fingerprint: "fp3" }), "new");
      expect(result).toMatchObject({ batched: 3, parked: 1 });
    });

    it("holds the batch when the day's remaining budget cannot cover its estimate", async () => {
      jobsApi.selectQueuedJobs.mockImplementation(onlyNew([job(1)]));
      mockBudgetLeft.mockResolvedValue(0.0001);

      const result = await runSummarySweep(env, { now: NOW, discover: false });

      expect(mockSubmitBatch).not.toHaveBeenCalled();
      expect(result.warnings.some((w) => w.startsWith("daily summary budget too low for a batch"))).toBe(true);
    });
  });
});
