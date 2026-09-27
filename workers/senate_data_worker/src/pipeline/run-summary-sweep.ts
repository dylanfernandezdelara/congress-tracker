import {
  DIGEST_BATCH_BILLS_PER_RUN,
  DIGEST_BATCH_EXPIRE_HOURS,
  DIGEST_BATCH_MAX_ATTEMPTS,
  DIGEST_DISCOVERY_PAGES_PER_RUN,
  DIGEST_NEW_BILL_DAYS,
  DIGEST_RECHECK_HOURS,
  DIGEST_RECHECK_PER_RUN,
  DIGEST_REWRITES_PER_RUN,
} from "../constants";
import type { Env } from "../config";
import { congressNumber } from "../config";
import {
  closeDigestBatch,
  enqueueDigestJobs,
  insertDigestBatch,
  insertDigestStubs,
  markJobsBatched,
  selectBatchJobs,
  selectOpenBatches,
  selectQueuedJobs,
  selectKnownBills,
  selectRecheckBills,
  settleJob,
  type DigestJob,
} from "../d1/digest-jobs";
import { getDigest, storedGenerator } from "../d1/digests";
import { getPipelineState, setPipelineState } from "../d1/pipeline-state";
import { budgetLeft, recordSpend } from "../digest/budget";
import { newBillModel } from "../digest/models";
import { getBatch, submitBatch, type BatchResultItem, type BatchState } from "../digest/openrouter-client";
import { prepareBill, type PreparedBill } from "../digest/prepare";
import {
  combineAndStore,
  firstPassMessages,
  isLong,
  notesFrom,
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
  rewritten: number;
  batched: number;
  stored: number;
  failed: number;
  spentUsd: number;
  warnings: string[];
}

export const DISCOVERY_CURSOR_KEY = "digest_discovery_cursor";
const DISCOVERY_PAGE_SIZE = 250;
/** Update dates are day-granular; each new window starts this far before the last one ended. */
const DISCOVERY_OVERLAP_MS = 36 * 3_600_000;

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
    rewritten: 0,
    batched: 0,
    stored: 0,
    failed: 0,
    spentUsd: 0,
    warnings: [],
  };

  constructor(
    private readonly env: Env,
    private readonly now: Date
  ) {}

  private async settle(job: BillRef, outcome: WriteOutcome): Promise<void> {
    this.result.spentUsd += outcome.cost;
    if (outcome.status === "stored") {
      this.result.stored += 1;
      await settleJob(this.env.DB, job, "done");
      return;
    }
    this.result.failed += 1;
    this.result.warnings.push(`${label(job)}: ${describe(outcome)}`);
    await settleJob(this.env.DB, job, "queued", { error: describe(outcome) });
  }

  private async fail(job: BillRef, err: unknown): Promise<void> {
    this.result.failed += 1;
    this.result.warnings.push(`${label(job)}: ${message(err)}`);
    await settleJob(this.env.DB, job, "queued", { error: message(err) });
  }

  // 1. Finished batches: store each reply that passes the checks; write the rest directly.
  async collect(): Promise<void> {
    for (const batch of await selectOpenBatches(this.env.DB)) {
      let state: BatchState;
      try {
        state = await getBatch(this.env, batch.id);
      } catch (err) {
        this.result.warnings.push(`batch ${batch.id}: ${message(err)}`);
        continue;
      }
      const expired = this.now.getTime() - Date.parse(batch.submitted_at) > DIGEST_BATCH_EXPIRE_HOURS * 3_600_000;
      if (!state.done && !expired) continue;

      const jobs = await selectBatchJobs(this.env.DB, batch.id);
      if (state.status !== "completed") {
        // Failed, cancelled or expired: back in the queue; after too many tries a bill is written directly.
        for (const job of jobs) await settleJob(this.env.DB, job, "queued", { error: `batch ${state.status}` });
        await closeDigestBatch(this.env.DB, batch.id, "failed", state.cost);
        this.result.warnings.push(`batch ${batch.id} ${state.status}; ${jobs.length} bill(s) requeued`);
        continue;
      }

      if (state.cost) {
        await recordSpend(this.env, state.cost);
        this.result.spentUsd += state.cost;
      }
      const byBill = new Map<string, Map<string, BatchResultItem>>();
      for (const item of state.results) {
        const [bill, key] = item.customId.split(":");
        if (!bill || !key) continue;
        if (!byBill.has(bill)) byBill.set(bill, new Map());
        byBill.get(bill)!.set(key, item);
      }
      for (const job of jobs) {
        await this.collectJob(job, byBill.get(refKey(job)) ?? new Map());
        this.result.collected += 1;
      }
      await closeDigestBatch(this.env.DB, batch.id, "collected", state.cost);
    }
  }

  private async collectJob(job: DigestJob, items: Map<string, BatchResultItem>): Promise<void> {
    try {
      const prepared = await prepareBill(this.env, job);
      if (prepared.fingerprint !== job.fingerprint) {
        // The bill changed while its batch ran; the reply describes an older version.
        await settleJob(this.env.DB, job, "queued", { error: "changed during batch" });
        return;
      }
      const tier = tierOf(job);
      const model = newBillModel(this.env);
      let outcome: WriteOutcome = isLong(prepared)
        ? await combineAndStore(this.env, prepared, {
            tier,
            model,
            notes: notesFrom(firstPassMessages(prepared).map(({ key }) => items.get(key)?.content ?? null)),
            priorCost: 0,
          })
        : await storeReply(this.env, prepared, { tier, model: model.id, content: items.get("single")?.content ?? null, cost: 0 });
      // A missing, unparseable or rejected batch reply is written directly (Luna, then Sonnet).
      if (outcome.status !== "stored") outcome = await writeSummary(this.env, prepared, tier);
      await this.settle(job, outcome);
    } catch (err) {
      await this.fail(job, err);
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

  // 4. Bills that matter, written now (Sonnet; Luna for giant bills), a few per run.
  async rewrite(limit: number): Promise<void> {
    for (const job of await selectQueuedJobs(this.env.DB, { matters: true, limit })) {
      try {
        const prepared = await prepareBill(this.env, job);
        if (await isCurrent(this.env, prepared, "rewrite")) {
          this.result.unchanged += 1;
          await settleJob(this.env.DB, job, "done");
          continue;
        }
        if ((await budgetLeft(this.env)) <= 0) {
          this.result.warnings.push("daily summary budget spent; rewrites resume tomorrow");
          return;
        }
        const outcome = await writeSummary(this.env, prepared, "rewrite");
        if (outcome.status === "stored") this.result.rewritten += 1;
        await this.settle(job, outcome);
      } catch (err) {
        await this.fail(job, err);
      }
    }
  }

  // 5. Everything else, in one Luna batch (half price; results usually within minutes, collected next run).
  async submit(limit: number): Promise<void> {
    const ready: PreparedBill[] = [];
    for (const job of await selectQueuedJobs(this.env.DB, { matters: false, limit })) {
      try {
        const prepared = await prepareBill(this.env, job);
        if (await isCurrent(this.env, prepared, "new")) {
          this.result.unchanged += 1;
          await settleJob(this.env.DB, job, "done");
        } else if (job.attempts >= DIGEST_BATCH_MAX_ATTEMPTS) {
          // Batches keep failing for this bill: write it directly, once.
          const outcome = await writeSummary(this.env, prepared, "new");
          await this.settle(job, outcome);
          if (outcome.status !== "stored") await settleJob(this.env.DB, job, "done", { error: describe(outcome) });
        } else {
          ready.push(prepared);
        }
      } catch (err) {
        await this.fail(job, err);
      }
    }
    if (ready.length === 0) return;
    if ((await budgetLeft(this.env)) <= 0) {
      this.result.warnings.push("daily summary budget spent; new bills wait for tomorrow");
      return;
    }
    const model = newBillModel(this.env);
    const requests = ready.flatMap((prepared) =>
      firstPassMessages(prepared).map(({ key, messages }) => ({ customId: `${refKey(prepared.ref)}:${key}`, messages }))
    );
    try {
      const id = await submitBatch(this.env, model, requests);
      await insertDigestBatch(this.env.DB, { id, model: model.id, requests: requests.length }, this.now.toISOString());
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

/**
 * Hourly plain-language summaries. Collects finished Luna batches, finds bills Congress.gov updated since the last
 * run, re-checks bills still waiting on their text or CRS summary, rewrites bills that matter (a few per run), and
 * sends everything else to one Luna batch. A bill whose inputs are unchanged costs no model call. Never throws;
 * problems are reported in `warnings`.
 */
export async function runSummarySweep(
  env: Env,
  options: { now?: Date; rewrites?: number; batchBills?: number; discover?: boolean } = {}
): Promise<SummarySweepResult> {
  const sweep = new Sweep(env, options.now ?? new Date());
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
