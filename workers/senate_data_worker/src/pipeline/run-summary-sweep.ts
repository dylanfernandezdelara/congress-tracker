import {
  DIGEST_BATCH_BILLS_PER_RUN,
  DIGEST_BATCH_MAX_TOKENS,
  DIGEST_BATCH_SCAN_PER_RUN,
  DIGEST_COLLECT_BILLS_PER_RUN,
  DIGEST_BATCH_EXPIRE_HOURS,
  DIGEST_BATCH_MAX_ATTEMPTS,
  DIGEST_MAX_ATTEMPTS,
  DIGEST_DISCOVERY_PAGES_PER_RUN,
  DIGEST_NEW_BILL_DAYS,
  DIGEST_RECHECK_HOURS,
  DIGEST_RECHECK_PER_RUN,
  DIGEST_REWRITE_SCAN_PER_RUN,
  DIGEST_REWRITES_PER_RUN,
  DIGEST_SWEEP_RUN_WINDOW_MS,
  DIGEST_SWEEP_WRITE_WINDOW_MS,
  DIGEST_SYNC_WRITES_PER_RUN,
} from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import {
  closeDigestBatch,
  enqueueDigestJobs,
  insertDigestBatch,
  insertDigestStubs,
  markAttempt,
  markJobsBatched,
  selectBatchJobs,
  selectOpenBatches,
  selectQueuedJobs,
  selectKnownBills,
  selectRecheckBills,
  settleJob,
  type DigestBatchRow,
  type DigestJob,
} from "../d1/digest-jobs";
import { getDigest, storedGenerator } from "../d1/digests";
import { getPipelineState, setPipelineState } from "../d1/pipeline-state";
import { budgetLeft, recordSpend } from "../digest/budget";
import { approxTokens } from "../digest/bill-text-parse";
import { newBillModel, type DigestModel } from "../digest/models";
import { cancelBatch, getBatch, submitBatch, type BatchResultItem, type BatchState } from "../digest/openrouter-client";
import { prepareBill, type PreparedBill } from "../digest/prepare";
import {
  combineAndStore,
  firstPassMessages,
  isLong,
  notesFrom,
  otherModel,
  storeReply,
  writeSummary,
  type Tier,
  type WriteOutcome,
} from "../digest/write";
import { fetchUpdatedBillsPage } from "../sources/updated-bills";
import type { BillRef } from "../types";
import { billLabel } from "./bill-label";

export interface SummarySweepResult {
  collected: number;
  discovered: number;
  rechecked: number;
  unchanged: number;
  /** Bills whose summaries kept failing the checks for the same inputs; retried when the bill changes. */
  parked: number;
  rewritten: number;
  batched: number;
  stored: number;
  failed: number;
  spentUsd: number;
  warnings: string[];
}

export const DISCOVERY_CURSOR_KEY = "digest_discovery_cursor";
const DISCOVERY_PAGE_SIZE = 250;
/** The list filters by exact update time; a small overlap covers updates recorded late. */
const DISCOVERY_OVERLAP_MS = 3 * 3_600_000;
/** Luna's reasoning plus the JSON answer, per request, for the batch estimate (high effort runs 2–5k). */
const ESTIMATED_OUTPUT_TOKENS = 4_000;

interface DiscoveryCursor {
  fromIso: string;
  /** End of the window being paged; fixed until the window is exhausted so offsets stay stable. */
  toIso: string;
  offset: number;
}

export const refKey = (ref: BillRef): string => `${ref.congress}-${ref.type.toLowerCase()}-${ref.number}`;
const label = (ref: BillRef) => billLabel(ref.type, ref.number, ref.congress);
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Bills that matter are rewrites; everything else a first summary. */
const tierOf = (job: DigestJob): Tier => (job.matters ? "rewrite" : "new");

/**
 * Nothing to do when the stored summary was written from these same inputs at this tier or above. A bill that came
 * to matter since its first summary is rewritten even with unchanged inputs; long bills are Luna at every tier.
 */
async function isCurrent(env: Env, prepared: PreparedBill, tier: Tier): Promise<boolean> {
  const row = await getDigest(env.DB, prepared.ref.congress, prepared.ref.type, prepared.ref.number);
  const generator = storedGenerator(row?.digest_json ?? null);
  if (!generator || generator.fingerprint !== prepared.fingerprint) return false;
  return generator.tier === "rewrite" || tier === "new" || generator.long;
}

function describe(outcome: WriteOutcome): string {
  switch (outcome.status) {
    case "rejected":
      return `rejected: ${outcome.reasons.join("; ")}`;
    case "failed":
      return outcome.reason;
    case "over_budget":
      return "daily budget spent";
    default:
      return "";
  }
}

class Sweep {
  readonly result: SummarySweepResult = {
    collected: 0,
    discovered: 0,
    rechecked: 0,
    unchanged: 0,
    parked: 0,
    rewritten: 0,
    batched: 0,
    stored: 0,
    failed: 0,
    spentUsd: 0,
    warnings: [],
  };
  private syncWrites = 0;
  /** Real clock, not `now`: this bounds how long the run spends writing. */
  private readonly writeDeadline = Date.now() + DIGEST_SWEEP_WRITE_WINDOW_MS;
  private readonly runDeadline = Date.now() + DIGEST_SWEEP_RUN_WINDOW_MS;
  /** Long bills that matter: Luna at every tier, so they go in the batch at half price instead of a slow direct write. */
  private readonly longRewrites: Array<{ job: DigestJob; prepared: PreparedBill }> = [];

  constructor(
    private readonly env: Env,
    private readonly now: Date,
    private readonly maxSyncWrites: number
  ) {}

  private canWriteNow(): boolean {
    return this.syncWrites < this.maxSyncWrites && Date.now() < this.writeDeadline;
  }

  /** Tries these inputs have had so far. */
  private static attemptsFor(job: DigestJob, fingerprint: string): number {
    return job.fingerprint === fingerprint ? job.attempts : 0;
  }

  /**
   * A paid synchronous write. The try is counted before any money is spent, so a run cut off mid-write still moves
   * the bill toward parking. Stored → done; otherwise back in the queue, or parked after DIGEST_MAX_ATTEMPTS.
   */
  private async paidWrite(job: DigestJob, prepared: PreparedBill, write: () => Promise<WriteOutcome>): Promise<WriteOutcome> {
    this.syncWrites += 1;
    const fingerprint = prepared.fingerprint;
    const attempts = Sweep.attemptsFor(job, fingerprint) + 1;
    await markAttempt(this.env.DB, job, fingerprint, attempts);
    // A throw after the try is counted (a timeout, a provider error) is a failed try, never an unreadable bill:
    // that would reset the count and let the same inputs be paid for again and again.
    const outcome = await write().catch(
      (err: unknown): WriteOutcome => ({ status: "failed", cost: 0, reason: message(err) })
    );
    this.result.spentUsd += outcome.cost;
    if (outcome.status === "stored") {
      this.result.stored += 1;
      await settleJob(this.env.DB, job, "done", { fingerprint, attempts: 0 });
      return outcome;
    }
    this.result.failed += 1;
    this.result.warnings.push(`${label(job)}: ${describe(outcome)}`);
    // A spent budget is not the bill's fault: give the try back.
    const counted = outcome.status === "over_budget" ? attempts - 1 : attempts;
    await settleJob(this.env.DB, job, counted >= DIGEST_MAX_ATTEMPTS ? "done" : "queued", {
      error: describe(outcome),
      fingerprint,
      attempts: counted,
    });
    return outcome;
  }

  /** True (and the job is closed) when this bill already failed too often with these same inputs. */
  private async parkedJob(job: DigestJob, prepared: PreparedBill): Promise<boolean> {
    if (Sweep.attemptsFor(job, prepared.fingerprint) < DIGEST_MAX_ATTEMPTS) return false;
    this.result.parked += 1;
    await settleJob(this.env.DB, job, "done", { error: `parked after ${job.attempts} failed attempts; retried when the bill changes` });
    return true;
  }

  /**
   * The bill could not be read (Congress.gov down, a bad reference), so nothing was paid for. Back in the queue,
   * counted apart from failed summaries so a flaky source never resets those; a bill that cannot be read run after
   * run is parked, so it cannot cost five requests an hour forever.
   */
  private async fail(job: DigestJob, err: unknown): Promise<void> {
    this.result.failed += 1;
    this.result.warnings.push(`${label(job)}: ${message(err)}`);
    const readFailures = job.readFailures + 1;
    await settleJob(this.env.DB, job, readFailures >= DIGEST_MAX_ATTEMPTS ? "done" : "queued", {
      error: readFailures >= DIGEST_MAX_ATTEMPTS ? `parked: unreadable ${readFailures} times: ${message(err)}` : message(err),
      readFailures,
    });
  }

  /** No new bill is started after this: the run must end, and free the write lease, well before 15 minutes. */
  private pastRunDeadline(): boolean {
    return Date.now() >= this.runDeadline;
  }

  // 1. Finished batches: store each reply that passes the checks; write the rest directly, within the caps.
  async collect(): Promise<void> {
    let budget = DIGEST_COLLECT_BILLS_PER_RUN;
    for (const batch of await selectOpenBatches(this.env.DB)) {
      if (budget <= 0) return;
      const expired = this.now.getTime() - Date.parse(batch.submitted_at) > DIGEST_BATCH_EXPIRE_HOURS * 3_600_000;
      let state: BatchState | null = null;
      try {
        state = await getBatch(this.env, batch.id);
      } catch (err) {
        this.result.warnings.push(`batch ${batch.id}: ${message(err)}`);
        // An unreadable batch that is also past its window (purged, bad id) would hold its bills forever.
        if (!expired) continue;
      }
      if (state && !state.done && !expired) continue;

      const jobs = await selectBatchJobs(this.env.DB, batch.id);
      if (!state || state.status !== "completed") {
        // Failed, cancelled, expired or unreadable: back in the queue; after too many tries a bill is written directly.
        if (!state?.done) await cancelBatch(this.env, batch.id);
        for (const job of jobs) await settleJob(this.env.DB, job, "queued", { error: `batch ${state?.status ?? "unreadable"}` });
        await this.closeBatch(batch, "failed", state?.cost ?? (state ? 0 : null));
        this.result.warnings.push(`batch ${batch.id} ${state?.status ?? "unreadable"}; ${jobs.length} bill(s) requeued`);
        continue;
      }

      const byBill = new Map<string, Map<string, BatchResultItem>>();
      for (const item of state.results) {
        const [bill, key] = item.customId.split(":");
        if (!bill || !key) continue;
        if (!byBill.has(bill)) byBill.set(bill, new Map());
        byBill.get(bill)!.set(key, item);
      }
      let left = jobs.length;
      for (const job of jobs) {
        if (budget <= 0 || this.pastRunDeadline()) break;
        budget -= 1;
        const done = await this.collectJob(job, byBill.get(refKey(job)) ?? new Map());
        if (!done) break;
        left -= 1;
        this.result.collected += 1;
      }
      // Bills not reached stay batched; the batch stays open and is read again next run.
      if (left === 0) await this.closeBatch(batch, "collected", state.cost);
    }
  }

  /**
   * Close a batch and settle its charge: the estimate was counted when it was sent, so only the difference is
   * recorded now, once. An unknown charge keeps the estimate.
   */
  private async closeBatch(batch: DigestBatchRow, state: "collected" | "failed", actual: number | null): Promise<void> {
    const estimate = batch.cost ?? 0;
    const charged = actual ?? estimate;
    await closeDigestBatch(this.env.DB, batch.id, state, charged);
    await recordSpend(this.env, charged - estimate);
    this.result.spentUsd += charged;
  }

  /** Returns false when the run is out of write capacity and the job was left for the next run. */
  private async collectJob(job: DigestJob, items: Map<string, BatchResultItem>): Promise<boolean> {
    try {
      const prepared = await prepareBill(this.env, job);
      if (prepared.fingerprint !== job.fingerprint) {
        // The bill changed while its batch ran; the reply describes an older version.
        await settleJob(this.env.DB, job, "queued", { error: "changed during batch" });
        return true;
      }
      // Short bills in a batch were sent as first summaries; long ones keep their tier (Luna at every tier).
      const tier: Tier = isLong(prepared) ? tierOf(job) : "new";
      const luna = newBillModel(this.env);
      if (isLong(prepared)) {
        // The combine pass is a paid direct call either way.
        if (!this.canWriteNow()) return false;
        const notes = notesFrom(firstPassMessages(prepared).map(({ key }) => items.get(key)?.content ?? null));
        await this.paidWrite(job, prepared, async () => {
          const first = await combineAndStore(this.env, prepared, { tier, model: luna, notes, priorCost: 0 });
          if (first.status !== "rejected") return first;
          // Only the combine switches model; the part notes are kept, never re-read at full price.
          const second = await combineAndStore(this.env, prepared, { tier, model: otherModel(this.env, luna), notes, priorCost: first.cost });
          return second.status === "stored" ? second : first;
        });
        return true;
      }
      const stored = await storeReply(this.env, prepared, { tier, model: luna.id, content: items.get("single")?.content ?? null, cost: 0 });
      if (stored.status === "stored") {
        this.result.stored += 1;
        await settleJob(this.env.DB, job, "done", { fingerprint: prepared.fingerprint, attempts: 0 });
        return true;
      }
      // A missing, unparseable or rejected reply goes straight to the other model.
      if (!this.canWriteNow()) {
        await settleJob(this.env.DB, job, "queued", { error: describe(stored) });
        return true;
      }
      await this.paidWrite(job, prepared, () =>
        writeSummary(this.env, prepared, tier, { model: otherModel(this.env, luna), retry: false })
      );
      return true;
    } catch (err) {
      await this.fail(job, err);
      return true;
    }
  }

  // 2. Every bill type Congress.gov updated since the last run: stub rows for new bills, and a summary check.
  async discover(): Promise<void> {
    const apiKey = this.env.CONGRESS_API_KEY;
    if (!apiKey?.trim()) return;
    const congress = congressNumber(this.env);
    const nowIso = this.now.toISOString();
    // First run starts from yesterday. Older bills are the backfill, which runs separately.
    let cursor = (await getPipelineState<DiscoveryCursor>(this.env.DB, DISCOVERY_CURSOR_KEY)) ?? {
      fromIso: new Date(this.now.getTime() - 24 * 3_600_000).toISOString(),
      toIso: nowIso,
      offset: 0,
    };
    for (let page = 0; page < DIGEST_DISCOVERY_PAGES_PER_RUN; page += 1) {
      const { bills, hasMore } = await fetchUpdatedBillsPage(apiKey, {
        congress,
        fromIso: cursor.fromIso,
        toIso: cursor.toIso,
        offset: cursor.offset,
        limit: DISCOVERY_PAGE_SIZE,
      });
      // New bills, and bills already on the site. Other old bills that changed are the backfill's, not the sweep's.
      const known = await selectKnownBills(this.env.DB, congress, bills);
      const newSince = new Date(this.now.getTime() - DIGEST_NEW_BILL_DAYS * 86_400_000).toISOString().slice(0, 10);
      const fresh = bills.filter((b) => (b.introducedDate ?? "") >= newSince);
      const wanted = bills.filter((b) => known.has(`${b.type}-${b.number}`) || (b.introducedDate ?? "") >= newSince);
      await insertDigestStubs(this.env.DB, fresh, nowIso);
      await enqueueDigestJobs(this.env.DB, wanted, "new", nowIso);
      this.result.discovered += wanted.length;
      if (hasMore) {
        cursor = { ...cursor, offset: cursor.offset + bills.length };
        continue;
      }
      cursor = { fromIso: new Date(Date.parse(cursor.toIso) - DISCOVERY_OVERLAP_MS).toISOString(), toIso: nowIso, offset: 0 };
      break;
    }
    await setPipelineState(this.env.DB, DISCOVERY_CURSOR_KEY, cursor);
  }

  // 3. Bills still waiting on their text or CRS summary: those are not always announced by an update date.
  async recheck(): Promise<void> {
    const bills = await selectRecheckBills(this.env.DB, {
      congress: congressNumber(this.env),
      checkedBeforeIso: new Date(this.now.getTime() - DIGEST_RECHECK_HOURS * 3_600_000).toISOString(),
      limit: DIGEST_RECHECK_PER_RUN,
    });
    await enqueueDigestJobs(this.env.DB, bills, "new", this.now.toISOString());
    this.result.rechecked = bills.length;
  }

  // 4. Bills that matter, written now with Sonnet, a few per run. Long ones join the Luna batch.
  async rewrite(limit: number): Promise<void> {
    let writes = 0;
    for (const job of await selectQueuedJobs(this.env.DB, { matters: true, limit: DIGEST_REWRITE_SCAN_PER_RUN })) {
      if (writes >= limit || !this.canWriteNow() || this.pastRunDeadline()) return;
      try {
        const prepared = await prepareBill(this.env, job);
        if (await isCurrent(this.env, prepared, "rewrite")) {
          this.result.unchanged += 1;
          await settleJob(this.env.DB, job, "done");
          continue;
        }
        if (await this.parkedJob(job, prepared)) continue;
        if (isLong(prepared)) {
          this.longRewrites.push({ job, prepared });
          continue;
        }
        if ((await budgetLeft(this.env)) <= 0) {
          this.result.warnings.push("daily summary budget spent; rewrites resume tomorrow");
          return;
        }
        writes += 1;
        const outcome = await this.paidWrite(job, prepared, () => writeSummary(this.env, prepared, "rewrite"));
        if (outcome.status === "stored") this.result.rewritten += 1;
      } catch (err) {
        await this.fail(job, err);
      }
    }
  }

  // 5. Everything else, in one Luna batch (half price; results usually within minutes, collected next run).
  async submit(limit: number): Promise<void> {
    const ready: PreparedBill[] = this.longRewrites.map(({ prepared }) => prepared);
    let tokens = ready.reduce((n, p) => n + p.totalTokens, 0);
    for (const job of await selectQueuedJobs(this.env.DB, { matters: false, limit: DIGEST_BATCH_SCAN_PER_RUN })) {
      if (ready.length >= limit + this.longRewrites.length || tokens >= DIGEST_BATCH_MAX_TOKENS || this.pastRunDeadline()) break;
      try {
        const prepared = await prepareBill(this.env, job);
        if (await isCurrent(this.env, prepared, "new")) {
          this.result.unchanged += 1;
          await settleJob(this.env.DB, job, "done");
        } else if (await this.parkedJob(job, prepared)) {
          continue;
        } else if (Sweep.attemptsFor(job, prepared.fingerprint) >= DIGEST_BATCH_MAX_ATTEMPTS && !isLong(prepared)) {
          // Batches keep failing for these inputs: write the bill directly, if the run has room. Long bills stay in
          // batches (Luna either way, and a direct part-by-part write takes minutes); they park at DIGEST_MAX_ATTEMPTS.
          if (this.canWriteNow() && (await budgetLeft(this.env)) > 0) {
            await this.paidWrite(job, prepared, () => writeSummary(this.env, prepared, "new"));
          }
        } else {
          ready.push(prepared);
          tokens += Math.max(prepared.totalTokens, 1);
        }
      } catch (err) {
        await this.fail(job, err);
      }
    }
    if (ready.length === 0) return;
    const model = newBillModel(this.env);
    const requests = ready.flatMap((prepared) =>
      firstPassMessages(prepared).map(({ key, messages }) => ({ customId: `${refKey(prepared.ref)}:${key}`, messages }))
    );
    // Counted against the day's budget now; the difference is settled when the batch is collected.
    const estimate = estimateBatchCost(model, requests);
    if ((await budgetLeft(this.env)) < estimate) {
      this.result.warnings.push(`daily summary budget too low for a batch (~$${estimate.toFixed(3)}); new bills wait for tomorrow`);
      return;
    }
    try {
      const id = await submitBatch(this.env, model, requests);
      await insertDigestBatch(this.env.DB, { id, model: model.id, requests: requests.length, estimate }, this.now.toISOString());
      await recordSpend(this.env, estimate);
      await markJobsBatched(
        this.env.DB,
        ready.map((prepared) => ({ ref: prepared.ref, fingerprint: prepared.fingerprint })),
        id
      );
      this.result.batched += ready.length;
    } catch (err) {
      this.result.warnings.push(`batch submit: ${message(err)}`);
    }
  }
}

/** Upper-end estimate of a batch's charge: every prompt token, plus a full reasoning-and-answer budget per request. */
export function estimateBatchCost(model: DigestModel, requests: Array<{ messages: { system: string; user: string } }>): number {
  const price = model.batchPrice ?? { input: 0.05, output: 0.25 };
  const input = requests.reduce((n, r) => n + approxTokens(r.messages.system) + approxTokens(r.messages.user), 0);
  const output = requests.length * ESTIMATED_OUTPUT_TOKENS;
  return Math.round(((input * price.input + output * price.output) / 1e6) * 1e6) / 1e6;
}

/**
 * Hourly plain-language summaries. Collects finished Luna batches, finds bills Congress.gov updated since the last
 * run, re-checks bills still waiting on their text or CRS summary, rewrites bills that matter (a few per run), and
 * sends everything else to one Luna batch. A bill whose inputs are unchanged costs no model call. Never throws;
 * problems are reported in `warnings`.
 */
export async function runSummarySweep(
  env: Env,
  options: { now?: Date; rewrites?: number; batchBills?: number; discover?: boolean; syncWrites?: number } = {}
): Promise<SummarySweepResult> {
  const sweep = new Sweep(env, options.now ?? new Date(), options.syncWrites ?? DIGEST_SYNC_WRITES_PER_RUN);
  if (!env.OPENROUTER_API_KEY?.trim()) {
    sweep.result.warnings.push("OPENROUTER_API_KEY not set; summaries skipped");
    return sweep.result;
  }
  const steps: Array<[string, () => Promise<void>]> = [
    ["collect", () => sweep.collect()],
    ["discover", () => (options.discover === false ? Promise.resolve() : sweep.discover())],
    ["recheck", () => sweep.recheck()],
    ["rewrite", () => sweep.rewrite(options.rewrites ?? DIGEST_REWRITES_PER_RUN)],
    ["submit", () => sweep.submit(options.batchBills ?? DIGEST_BATCH_BILLS_PER_RUN)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      sweep.result.warnings.push(`${name} failed: ${message(err)}`);
    }
  }
  sweep.result.spentUsd = Math.round(sweep.result.spentUsd * 1e4) / 1e4;
  return sweep.result;
}
