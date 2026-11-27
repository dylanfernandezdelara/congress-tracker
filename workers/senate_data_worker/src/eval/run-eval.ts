import type { Env } from "../config";
import { ensureSchema } from "../d1/schema";
import { checkSummary } from "../digest/checks";
import { estimateCost } from "../digest/cost";
import type { DigestModel } from "../digest/models";
import { chatCompletion } from "../digest/openrouter-client";
import { parseSummaryReply } from "../digest/parse";
import { prepareBill, type PreparedBill } from "../digest/prepare";
import { PROMPT_VERSION, singlePassMessages } from "../digest/prompt";
import { inputsRecord } from "../digest/write";
import type { BillRef } from "../types";

/*
 * Eval rounds, run by the production worker on demand. A request (a row in eval_requests, written by
 * scripts/digest-eval/remote.mjs) names bills and candidate models; a one-minute cron picks it up, writes each
 * candidate's summary with the worker's own inputs, prompt and checks, and stores every reply in eval_outputs.
 * Nothing here touches the site: no digest is stored, and spend is capped per request, apart from the daily
 * summary budget.
 */

export interface EvalCandidate {
  key: string;
  /** OpenRouter model id. */
  model: string;
  reasoning?: { effort: "low" | "medium" | "high" };
  temperature?: number;
  maxTokens?: number;
  /** Normal-API price per million tokens, for the cap check before each call. */
  price: { input: number; output: number };
}

export interface EvalSpec {
  round: string;
  /** "119-hr-2140" style ids. */
  bills: string[];
  runs?: number;
  /** "hidden" (default): the model gets no CRS summary, as an eval of writing from the bill itself. */
  crs?: "hidden" | "given";
  candidates: EvalCandidate[];
}

export interface EvalTickResult {
  request: string | null;
  written: number;
  remaining: number;
  spent_usd: number;
  state?: string;
}

/** A tick stops starting calls after this long, so one minute's run never overlaps the next for long. */
const START_CALLS_FOR_MS = 120_000;
/** Longer than the last call a tick can start plus its timeout (180 s), so two ticks never run one request. */
const LEASE_MS = 6 * 60_000;
const CONCURRENCY = 6;

export function parseBillId(id: string): BillRef {
  const m = /^(\d+)-([a-z]+)-(\d+)$/i.exec(id.trim());
  if (!m) throw new Error(`bad bill id: ${id}`);
  return { congress: Number(m[1]), type: m[2]!.toUpperCase(), number: Number(m[3]) };
}

export function itemsOf(spec: EvalSpec): Array<{ key: string; bill: string; candidate: EvalCandidate; run: number }> {
  const runs = Math.max(1, Math.floor(spec.runs ?? 1));
  const out: Array<{ key: string; bill: string; candidate: EvalCandidate; run: number }> = [];
  for (const bill of spec.bills) {
    for (const candidate of spec.candidates) {
      for (let run = 1; run <= runs; run += 1) out.push({ key: `${bill}|${candidate.key}|${run}`, bill, candidate, run });
    }
  }
  return out;
}

export function modelOf(c: EvalCandidate): DigestModel {
  return {
    id: c.model,
    maxTokens: c.maxTokens ?? 12_000,
    price: c.price,
    ...(c.reasoning ? { reasoning: c.reasoning } : {}),
    ...(c.temperature !== undefined ? { temperature: c.temperature } : {}),
  };
}

/** The bill as this round's candidates see it: CRS removed from the input and from the checks' sources when hidden. */
export function asSeen(prepared: PreparedBill, crs: EvalSpec["crs"]): PreparedBill {
  if (crs === "given") return prepared;
  return { ...prepared, input: { ...prepared.input, crs: null }, checkSources: { ...prepared.checkSources, crsText: null } };
}

interface RequestRow {
  id: string;
  spec_json: string;
  cap_usd: number;
  state: string;
  spent_usd: number;
}

async function claim(db: D1Database, nowIso: string, leaseIso: string): Promise<RequestRow | null> {
  const row = await db
    .prepare(
      `SELECT id, spec_json, cap_usd, state, spent_usd FROM eval_requests
       WHERE state IN ('queued', 'running') AND (lease_until IS NULL OR lease_until < ?)
       ORDER BY created_at ASC LIMIT 1`
    )
    .bind(nowIso)
    .first<RequestRow>();
  if (!row) return null;
  const res = await db
    .prepare(
      `UPDATE eval_requests SET state = 'running', lease_until = ?, started_at = COALESCE(started_at, ?)
       WHERE id = ? AND state IN ('queued', 'running') AND (lease_until IS NULL OR lease_until < ?)`
    )
    .bind(leaseIso, nowIso, row.id, nowIso)
    .run();
  return (res.meta?.changes ?? 0) === 1 ? row : null;
}

async function finish(db: D1Database, id: string, state: string, error: string | null): Promise<void> {
  await db
    .prepare(`UPDATE eval_requests SET state = ?, error = ?, lease_until = NULL, finished_at = ? WHERE id = ?`)
    .bind(state, error, new Date().toISOString(), id)
    .run();
}

/** One minute's work: continue the oldest open request until its time slice, its cap, or its items run out. */
export async function runEvalTick(env: Env, now = Date.now()): Promise<EvalTickResult> {
  await ensureSchema(env.DB);
  const claimed = await claim(env.DB, new Date(now).toISOString(), new Date(now + LEASE_MS).toISOString());
  if (!claimed) return { request: null, written: 0, remaining: 0, spent_usd: 0 };

  const req = claimed;
  let spec: EvalSpec;
  try {
    spec = JSON.parse(req.spec_json) as EvalSpec;
    if (!Array.isArray(spec.bills) || !Array.isArray(spec.candidates) || !spec.candidates.length) throw new Error("spec needs bills and candidates");
  } catch (err: unknown) {
    await finish(env.DB, req.id, "failed", err instanceof Error ? err.message : String(err));
    return { request: req.id, written: 0, remaining: 0, spent_usd: req.spent_usd, state: "failed" };
  }

  const { results } = await env.DB.prepare(`SELECT item_key FROM eval_outputs WHERE request_id = ?`).bind(req.id).all<{ item_key: string }>();
  const done = new Set((results ?? []).map((r) => r.item_key));
  const pending = itemsOf(spec).filter((i) => !done.has(i.key));

  const prepared = new Map<string, Promise<PreparedBill>>();
  const prepare = (bill: string) => {
    if (!prepared.has(bill)) prepared.set(bill, prepareBill(env, parseBillId(bill)).then((p) => asSeen(p, spec.crs)));
    return prepared.get(bill)!;
  };

  // Spend: what the request had before this tick, plus each call's estimate while it runs, settled to its charge.
  let committed = req.spent_usd;
  let reserved = 0;
  let capped = false;
  let written = 0;
  const startedBy = now + START_CALLS_FOR_MS;
  const queue = [...pending];

  async function worker(): Promise<void> {
    for (;;) {
      if (capped || Date.now() > startedBy) return;
      const item = queue.shift();
      if (!item) return;
      const row = await runItem(item);
      if (row === "capped") {
        capped = true;
        queue.unshift(item);
        return;
      }
      written += 1;
    }
  }

  async function runItem(item: (typeof pending)[number]): Promise<"ok" | "capped"> {
    let p: PreparedBill;
    try {
      p = await prepare(item.bill);
    } catch (err: unknown) {
      await saveOutput(env.DB, req.id, item, { state: "failed", model: item.candidate.model, error: `prepare: ${messageOf(err)}` });
      return "ok";
    }
    if (p.parts.length > 0) {
      await saveOutput(env.DB, req.id, item, { state: "failed", model: item.candidate.model, error: "long bill (split into parts): not supported in eval rounds" });
      return "ok";
    }
    const model = modelOf(item.candidate);
    const messages = singlePassMessages(p.input);
    // The cap assumes the full output allowance (estimateCost does so for "anthropic" models): reasoning models run
    // well past the summary writer's 4k guess (Gemini 4 Hydrogen cost ~1.6x that estimate in round 8).
    const estimate = estimateCost({ ...model, provider: "anthropic" }, [messages], "direct");
    if (committed + reserved + estimate > req.cap_usd) return "capped";
    reserved += estimate;
    let cost = 0;
    try {
      const reply = await chatCompletion(env, model, messages, {
        estimate,
        record: async (usd) => {
          cost += usd;
        },
      });
      const parsed = parseSummaryReply(reply.content, { basis: p.basis, parts: p.parts, totalTokens: p.totalTokens });
      const check = parsed ? checkSummary(parsed.checkable, p.checkSources, { long: false }) : null;
      await saveOutput(env.DB, req.id, item, {
        state: !parsed ? "rejected" : check!.blocking.length ? "rejected" : "ok",
        model: model.id,
        content: reply.content,
        summary: parsed?.checkable ?? null,
        blocking: parsed ? check!.blocking : ["reply did not parse"],
        warnings: check?.warnings ?? [],
        cost,
        promptTokens: reply.usage.promptTokens,
        completionTokens: reply.usage.completionTokens,
        inputs: { ...inputsRecord(p), crs_given: spec.crs === "given", fingerprint: p.fingerprint, prompt_version: PROMPT_VERSION },
      });
    } catch (err: unknown) {
      await saveOutput(env.DB, req.id, item, { state: "failed", model: model.id, cost, error: messageOf(err) });
    } finally {
      reserved -= estimate;
      committed += cost;
      await env.DB.prepare(`UPDATE eval_requests SET spent_usd = ? WHERE id = ?`).bind(round6(committed), req.id).run();
    }
    return "ok";
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const remaining = queue.length;
  let state = "running";
  if (remaining === 0) {
    state = "done";
    await finish(env.DB, req.id, "done", null);
  } else if (capped) {
    state = "capped";
    await finish(env.DB, req.id, "capped", `spend cap $${req.cap_usd} reached with ${remaining} left`);
  } else {
    // More to do: free the lease so the next minute continues.
    await env.DB.prepare(`UPDATE eval_requests SET lease_until = NULL WHERE id = ?`).bind(req.id).run();
  }
  return { request: req.id, written, remaining, spent_usd: round6(committed), state };
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

async function saveOutput(
  db: D1Database,
  requestId: string,
  item: { key: string; bill: string; candidate: EvalCandidate; run: number },
  o: {
    state: "ok" | "rejected" | "failed";
    model: string;
    content?: string | null;
    summary?: unknown;
    blocking?: string[];
    warnings?: string[];
    cost?: number;
    promptTokens?: number;
    completionTokens?: number;
    inputs?: unknown;
    error?: string;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO eval_outputs
       (request_id, item_key, bill_id, candidate, run, model, state, content, summary_json, blocking_json, warnings_json,
        cost, prompt_tokens, completion_tokens, inputs_json, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      requestId,
      item.key,
      item.bill,
      item.candidate.key,
      item.run,
      o.model,
      o.state,
      o.content ?? null,
      o.summary ? JSON.stringify(o.summary) : null,
      o.blocking ? JSON.stringify(o.blocking) : null,
      o.warnings ? JSON.stringify(o.warnings) : null,
      round6(o.cost ?? 0),
      o.promptTokens ?? null,
      o.completionTokens ?? null,
      o.inputs ? JSON.stringify(o.inputs) : null,
      o.error ?? null,
      new Date().toISOString()
    )
    .run();
}
