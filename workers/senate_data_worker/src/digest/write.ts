import type { Env } from "../config";
import { upsertDigest, type DigestGenerator, type StoredBillDigest } from "../d1/digests";
import { recordSpend } from "./budget";
import { BudgetShort, ensureBudget } from "./cost";
import { checkSummary, STYLE_ONLY_REASONS } from "./checks";
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
  /**
   * The day's budget could not cover the next paid call. `cost` is what this write spent before it stopped; `sent`
   * says whether any paid call went out at all (not inferred from cost: a reply without usage.cost reads as 0).
   */
  | { status: "over_budget"; cost: number; sent: boolean; reason?: string };

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
  params: {
    tier: Tier;
    model: string;
    content: string | null;
    cost: number;
    gatewayLogId?: string | null;
    /** The last model to try: a style-only problem (a vote headline) is kept as a warning, not a reason to have no summary. */
    lastTry?: boolean;
  }
): Promise<WriteOutcome> {
  const long = isLong(prepared);
  const parsed = parseSummaryReply(params.content, {
    basis: prepared.basis,
    parts: prepared.parts,
    totalTokens: prepared.totalTokens,
  });
  if (!parsed) return { status: "rejected", model: params.model, cost: params.cost, reasons: ["reply did not parse"] };
  const checked = checkSummary(parsed.checkable, prepared.checkSources, { long });
  const style = params.lastTry ? checked.blocking.filter((b) => STYLE_ONLY_REASONS.includes(b)) : [];
  const check = {
    ...checked,
    blocking: checked.blocking.filter((b) => !style.includes(b)),
    warnings: [...style, ...checked.warnings],
  };
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

/** What one write has paid for so far, and whether any paid call went out. */
interface Spent {
  usd: number;
  sent: boolean;
}

/**
 * Part notes for a long bill, a slice of parts at a time. The budget is checked before each slice (the slice's calls
 * go out together), and each slice's spend is recorded as it lands, so a budget stop mid-bill loses no charge.
 */
async function partNotes(env: Env, model: DigestModel, prepared: PreparedBill, spent: Spent): Promise<Record<string, unknown>[]> {
  const requests = firstPassMessages(prepared);
  const contents: Array<string | null> = new Array(requests.length).fill(null);
  for (let i = 0; i < requests.length; i += PART_CONCURRENCY) {
    const slice = requests.slice(i, i + PART_CONCURRENCY);
    await ensureBudget(env, model, slice.map((r) => r.messages));
    spent.sent = true;
    const results = await Promise.allSettled(slice.map((r) => chatCompletion(env, model, r.messages)));
    let cost = 0;
    results.forEach((r, j) => {
      if (r.status !== "fulfilled") return;
      cost += r.value.usage.cost;
      contents[i + j] = r.value.content;
    });
    spent.usd += cost;
    await recordSpend(env, cost);
  }
  return notesFrom(contents);
}

/** Combine collected part notes into the stored summary (the second pass for long bills). */
export async function combineAndStore(
  env: Env,
  prepared: PreparedBill,
  params: { tier: Tier; model: DigestModel; notes: Record<string, unknown>[]; priorCost: number; lastTry?: boolean }
): Promise<WriteOutcome> {
  // A summary missing big parts of the bill would be stored as current for these inputs, so require most of them.
  const needed = Math.ceil(prepared.parts.length * MIN_PART_COVERAGE);
  if (params.notes.length === 0 || params.notes.length < needed) {
    return { status: "failed", cost: params.priorCost, reason: `notes for ${params.notes.length} of ${prepared.parts.length} parts` };
  }
  const model = params.model;
  const messages = combineMessages(prepared.input, params.notes);
  await ensureBudget(env, model, [messages]);
  const reply = await chatCompletion(env, model, messages);
  const outcome = await storeReply(env, prepared, {
    tier: params.tier,
    model: model.id,
    content: reply.content,
    cost: params.priorCost + reply.usage.cost,
    gatewayLogId: reply.gatewayLogId,
    lastTry: params.lastTry,
  });
  await recordSpend(env, reply.usage.cost);
  return outcome;
}

/**
 * The combine pass with its one fallback: a rejected combine is retried with the other model on the same notes, so a
 * giant bill never re-reads its parts on Sonnet. Used by the direct writer and by batch collection. A budget too short
 * for either combine stops here with "over_budget" and what was already spent.
 */
export async function combineWithFallback(
  env: Env,
  prepared: PreparedBill,
  params: {
    tier: Tier;
    model: DigestModel;
    notes: Record<string, unknown>[];
    priorCost: number;
    /** A paid call (long-bill parts) already went out in this write. */
    priorSent?: boolean;
    retry?: boolean;
  }
): Promise<WriteOutcome> {
  let spent = params.priorCost;
  let sent = params.priorSent === true;
  try {
    const first = await combineAndStore(env, prepared, { tier: params.tier, model: params.model, notes: params.notes, priorCost: spent });
    spent = first.cost;
    // Only a rejected combine reaches the fallback, and a rejection means the combine call went out.
    sent = true;
    if (first.status !== "rejected" || params.retry === false) return first;
    const second = await combineAndStore(env, prepared, {
      tier: params.tier,
      model: otherModel(env, params.model),
      notes: params.notes,
      priorCost: spent,
      lastTry: true,
    });
    // second.cost already includes the first combine (priorCost); a double rejection reports both charges.
    return second.status === "stored" ? second : { ...first, cost: second.cost };
  } catch (err: unknown) {
    if (err instanceof BudgetShort) return { status: "over_budget", cost: spent, sent, reason: err.message };
    throw err;
  }
}

/**
 * Write a bill's summary now, on the normal API. A rejected reply is retried once with the other model; if that
 * is rejected too, the current summary stays. Spend counts against the daily cap, which is checked before every
 * paid call (`ensureBudget`): a write the budget cannot finish stops with "over_budget" and what it spent so far.
 */
export async function writeSummary(
  env: Env,
  prepared: PreparedBill,
  tier: Tier,
  options: { model?: DigestModel; retry?: boolean; lastTry?: boolean } = {}
): Promise<WriteOutcome> {
  const model = options.model ?? modelFor(env, tier, isLong(prepared));
  const retry = options.retry !== false;
  // What this write has paid for so far (each charge is recorded as it lands), for the outcome when it stops early.
  const spent: Spent = { usd: 0, sent: false };
  try {
    if (isLong(prepared)) {
      const notes = await partNotes(env, model, prepared, spent);
      return await combineWithFallback(env, prepared, { tier, model, notes, priorCost: spent.usd, priorSent: spent.sent, retry });
    }
    const messages = singlePassMessages(prepared.input);
    await ensureBudget(env, model, [messages]);
    spent.sent = true;
    const reply = await chatCompletion(env, model, messages);
    spent.usd += reply.usage.cost;
    await recordSpend(env, reply.usage.cost);
    const first = await storeReply(env, prepared, {
      tier,
      model: model.id,
      content: reply.content,
      cost: reply.usage.cost,
      gatewayLogId: reply.gatewayLogId,
      lastTry: options.lastTry,
    });
    if (first.status === "stored" || !retry) return first;
    const second = await writeSummary(env, prepared, tier, { model: otherModel(env, model), retry: false, lastTry: true });
    const cost = first.cost + second.cost;
    if (second.status === "stored") return { ...second, cost };
    // Stopped by the budget before the other model was called: the first model's call did go out.
    if (second.status === "over_budget") return { ...second, cost, sent: true };
    // Rejected (or failed) twice: the first model's reasons, and both models' charges.
    return { ...first, cost };
  } catch (err: unknown) {
    if (err instanceof BudgetShort) return { status: "over_budget", cost: spent.usd, sent: spent.sent, reason: err.message };
    return { status: "failed", cost: spent.usd, reason: err instanceof Error ? err.message : String(err), account: err instanceof AccountError };
  }
}
