import type { Env } from "../config";
import { upsertDigest, type DigestGenerator, type StoredBillDigest } from "../d1/digests";
import { budgetLeft, recordSpend } from "./budget";
import { checkSummary } from "./checks";
import { modelFor, newBillModel, rewriteModel, type DigestModel } from "./models";
import { AccountError, chatCompletion } from "./openrouter-client";
import { parseJsonObject, parseSummaryReply } from "./parse";
import type { PreparedBill } from "./prepare";
import { combineMessages, partMessages, PROMPT_VERSION, singlePassMessages, type DigestMessages } from "./prompt";

/**
 * The one place bill summaries are written. Both paths end here: the hourly batch (Luna, collected replies go
 * through `storeReply`) and the synchronous writer (`writeSummary`, Sonnet rewrites and batch retries).
 *
 * A reply is stored only when it parses and passes the blocking checks; otherwise the bill's current summary
 * stays and the caller decides what happens next.
 */

export type Tier = DigestGenerator["tier"];

export type WriteOutcome =
  | { status: "stored"; model: string; cost: number; warnings: string[] }
  | { status: "rejected"; model: string; cost: number; reasons: string[] }
  | { status: "failed"; cost: number; reason: string; account?: boolean }
  | { status: "over_budget"; cost: 0 };

/** Share of a long bill's parts that must have notes before they are combined. */
const MIN_PART_COVERAGE = 0.8;

/** Parts are summarized a few at a time: fast enough for the worker, gentle on provider rate limits. */
const PART_CONCURRENCY = 4;

export const isLong = (prepared: PreparedBill): boolean => prepared.parts.length > 0;

/** The model used when the first one's reply was rejected: Luna ↔ Sonnet. */
export function otherModel(env: Env, model: DigestModel): DigestModel {
  const luna = newBillModel(env);
  return model.id === luna.id ? rewriteModel(env) : luna;
}

/**
 * Parse, check and store one final reply (single pass or combine). Returns "rejected" with the reasons when the
 * reply is unusable, so the caller can retry with another model.
 */
export async function storeReply(
  env: Env,
  prepared: PreparedBill,
  params: { tier: Tier; model: string; content: string | null; cost: number; gatewayLogId?: string | null }
): Promise<WriteOutcome> {
  const long = isLong(prepared);
  const parsed = parseSummaryReply(params.content, {
    basis: prepared.basis,
    parts: prepared.parts,
    totalTokens: prepared.totalTokens,
  });
  if (!parsed) return { status: "rejected", model: params.model, cost: params.cost, reasons: ["reply did not parse"] };
  const check = checkSummary(parsed.checkable, prepared.checkSources, { long });
  if (check.blocking.length) return { status: "rejected", model: params.model, cost: params.cost, reasons: check.blocking };

  const generator: DigestGenerator = {
    model: params.model,
    prompt_version: PROMPT_VERSION,
    tier: params.tier,
    text_version: prepared.input.textVersion?.type ?? null,
    fingerprint: prepared.fingerprint,
    long,
    ...(params.gatewayLogId ? { gateway_log_id: params.gatewayLogId } : {}),
    ...(check.warnings.length ? { warnings: check.warnings } : {}),
    generated_at: new Date().toISOString(),
  };
  const digest: StoredBillDigest = { ...parsed.content, generator };
  await upsertDigest(env.DB, {
    congress: prepared.ref.congress,
    billType: prepared.ref.type,
    number: prepared.ref.number,
    title: prepared.bundle.title,
    policyArea: prepared.bundle.policyArea,
    rawSummaryText: prepared.bundle.rawSummaryText,
    digest,
  });
  return { status: "stored", model: params.model, cost: params.cost, warnings: check.warnings };
}

/** The messages for a bill's first (or only) pass: one request, or one per part. */
export function firstPassMessages(prepared: PreparedBill): Array<{ key: string; messages: DigestMessages }> {
  if (!isLong(prepared)) return [{ key: "single", messages: singlePassMessages(prepared.input) }];
  return prepared.parts.map((part, i) => ({ key: `part${i}`, messages: partMessages(prepared.input, part) }));
}

/** Part notes in bill order; a part whose reply did not parse is left out (see MIN_PART_COVERAGE). */
export function notesFrom(contents: Array<string | null>): Record<string, unknown>[] {
  return contents.map((c) => parseJsonObject(c)).filter((n): n is Record<string, unknown> => n !== null);
}

async function partNotes(env: Env, model: DigestModel, prepared: PreparedBill): Promise<{ notes: Record<string, unknown>[]; cost: number }> {
  const requests = firstPassMessages(prepared);
  const contents: Array<string | null> = new Array(requests.length).fill(null);
  let cost = 0;
  for (let i = 0; i < requests.length; i += PART_CONCURRENCY) {
    const slice = requests.slice(i, i + PART_CONCURRENCY);
    const results = await Promise.allSettled(slice.map((r) => chatCompletion(env, model, r.messages)));
    results.forEach((r, j) => {
      if (r.status !== "fulfilled") return;
      cost += r.value.usage.cost;
      contents[i + j] = r.value.content;
    });
  }
  return { notes: notesFrom(contents), cost };
}

/** Combine collected part notes into the stored summary (the second pass for long bills). */
export async function combineAndStore(
  env: Env,
  prepared: PreparedBill,
  params: { tier: Tier; model: DigestModel; notes: Record<string, unknown>[]; priorCost: number }
): Promise<WriteOutcome> {
  // A summary missing big parts of the bill would be stored as current for these inputs, so require most of them.
  const needed = Math.ceil(prepared.parts.length * MIN_PART_COVERAGE);
  if (params.notes.length === 0 || params.notes.length < needed) {
    return { status: "failed", cost: params.priorCost, reason: `notes for ${params.notes.length} of ${prepared.parts.length} parts` };
  }
  const model = params.model;
  const reply = await chatCompletion(env, model, combineMessages(prepared.input, params.notes));
  const outcome = await storeReply(env, prepared, {
    tier: params.tier,
    model: model.id,
    content: reply.content,
    cost: params.priorCost + reply.usage.cost,
    gatewayLogId: reply.gatewayLogId,
  });
  await recordSpend(env, reply.usage.cost);
  return outcome;
}

/**
 * Write a bill's summary now, on the normal API. A rejected reply is retried once with the other model; if that
 * is rejected too, the current summary stays. Spend counts against the daily cap, which is checked first.
 */
export async function writeSummary(
  env: Env,
  prepared: PreparedBill,
  tier: Tier,
  options: { model?: DigestModel; retry?: boolean } = {}
): Promise<WriteOutcome> {
  if ((await budgetLeft(env)) <= 0) return { status: "over_budget", cost: 0 };
  const model = options.model ?? modelFor(env, tier, isLong(prepared));
  const retry = options.retry !== false;
  try {
    if (isLong(prepared)) {
      const { notes, cost } = await partNotes(env, model, prepared);
      await recordSpend(env, cost);
      const first = await combineAndStore(env, prepared, { tier, model, notes, priorCost: cost });
      if (first.status !== "rejected" || !retry) return first;
      // Keep the notes; only the combine pass switches model, so a giant bill never re-reads on Sonnet.
      const second = await combineAndStore(env, prepared, { tier, model: otherModel(env, model), notes, priorCost: first.cost });
      return second.status === "stored" ? second : first;
    }
    const reply = await chatCompletion(env, model, singlePassMessages(prepared.input));
    await recordSpend(env, reply.usage.cost);
    const first = await storeReply(env, prepared, {
      tier,
      model: model.id,
      content: reply.content,
      cost: reply.usage.cost,
      gatewayLogId: reply.gatewayLogId,
    });
    if (first.status === "stored" || !retry) return first;
    const second = await writeSummary(env, prepared, tier, { model: otherModel(env, model), retry: false });
    return second.status === "stored" ? { ...second, cost: second.cost + first.cost } : first;
  } catch (err: unknown) {
    return { status: "failed", cost: 0, reason: err instanceof Error ? err.message : String(err), account: err instanceof AccountError };
  }
}
