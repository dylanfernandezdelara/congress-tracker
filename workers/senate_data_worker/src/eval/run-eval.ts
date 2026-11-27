import type { Env } from "../config";
import { ensureSchema } from "../d1/schema";
import { checkSummary } from "../digest/checks";
import { estimateCost } from "../digest/cost";
import type { DigestModel } from "../digest/models";
import type { CheckableSummary } from "../digest/checks";
import { chatCompletion } from "../digest/openrouter-client";
import { parseSummaryReply } from "../digest/parse";
import { prepareBill, type PreparedBill } from "../digest/prepare";
import { PROMPT_VERSION, singlePassMessages, type DigestMessages } from "../digest/prompt";
import { inputsRecord } from "../digest/write";
import type { BillRef } from "../types";
import { judgeMessages, parseVerdict, type JudgedSummary, type JudgeRubric } from "./judge";
import { promptParts } from "./variants";

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
  /** Prompt version from variants.ts; production's prompt when absent. */
  prompt?: string;
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

/** A summary to judge: one the worker wrote in an earlier request, or the bill's official CRS summary. */
export type SummaryRef = { request: string; item: string } | { crs: true };

/** A judge round: each pair is one call, A and B in the order given (rounds list both orders). */
export interface JudgeSpec {
  kind: "judge";
  round: string;
  judge: EvalCandidate;
  /** judge.ts rubric; v1 when absent. */
  rubric?: JudgeRubric;
  pairs: Array<{ key: string; bill: string; a: SummaryRef; b: SummaryRef }>;
}

type AnySpec = (EvalSpec & { kind?: "write" }) | JudgeSpec;

/** One call of a round: what it is about, and how to build its messages and read its reply. */
interface Task {
  key: string;
  bill: string;
  candidate: string;
  run: number;
  model: DigestModel;
  messages(p: PreparedBill): Promise<DigestMessages>;
  read(p: PreparedBill, content: string | null): { state: "ok" | "rejected"; summary: unknown; blocking: string[]; warnings: string[] };
}

export interface EvalTickResult {
  request: string | null;
  written: number;
  remaining: number;
  spent_usd: number;
  state?: string;
}

/**
 * A tick starts calls for this long. Ticks overlap (one starts every minute), and each claims calls one at a time, so
 * about four run side by side; a Worker invocation keeps at most 6 connections open, so overlap is what adds speed.
 */
const START_CALLS_FOR_MS = 240_000;
/** A claim older than this belongs to a tick that died: the last call a tick starts plus its timeout (180 s). */
const CLAIM_STALE_MS = 10 * 60_000;
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

/** An open request as one tick sees it. */
interface OpenRequest {
  row: RequestRow;
  spec: AnySpec;
  tasks: Task[];
  crs: EvalSpec["crs"];
  /** The cap refused a call this tick: start no more for this request. */
  capped: boolean;
  prepared: Map<string, Promise<PreparedBill>>;
}

async function finish(db: D1Database, id: string, state: string, error: string | null): Promise<void> {
  await db
    .prepare(`UPDATE eval_requests SET state = ?, error = ?, lease_until = NULL, finished_at = ? WHERE id = ?`)
    .bind(state, error, new Date().toISOString(), id)
    .run();
}

function writeTasks(spec: EvalSpec): Task[] {
  return itemsOf(spec).map((item) => {
    const parts = promptParts(item.candidate.prompt);
    return {
      key: item.key,
      bill: item.bill,
      candidate: item.candidate.key,
      run: item.run,
      model: modelOf(item.candidate),
      messages: async (p) => singlePassMessages(p.input, parts),
      read: (p, content) => {
        const parsed = parseSummaryReply(content, { basis: p.basis, parts: p.parts, totalTokens: p.totalTokens });
        if (!parsed) return { state: "rejected", summary: null, blocking: ["reply did not parse"], warnings: [] };
        const check = checkSummary(parsed.checkable, p.checkSources, { long: false });
        return { state: check.blocking.length ? "rejected" : "ok", summary: parsed.checkable, blocking: check.blocking, warnings: check.warnings };
      },
    };
  });
}

function judgeTasks(db: D1Database, spec: JudgeSpec): Task[] {
  const model = modelOf(spec.judge);
  const load = async (ref: SummaryRef, p: PreparedBill): Promise<JudgedSummary> => {
    if ("crs" in ref) {
      if (!p.input.crs?.text) throw new Error("bill has no CRS summary");
      return { kind: "crs", text: p.input.crs.text };
    }
    const row = await db
      .prepare(`SELECT summary_json FROM eval_outputs WHERE request_id = ? AND item_key = ?`)
      .bind(ref.request, ref.item)
      .first<{ summary_json: string | null }>();
    if (!row?.summary_json) throw new Error(`no summary for ${ref.request} ${ref.item}`);
    return { kind: "summary", summary: JSON.parse(row.summary_json) as CheckableSummary };
  };
  return spec.pairs.map((pair) => ({
    key: pair.key,
    bill: pair.bill,
    candidate: spec.judge.key,
    run: 1,
    model,
    // The judge reads the bill text without CRS (CRS can be a contestant); the CRS contestant comes from the full bill.
    messages: async (p) => judgeMessages(asSeen(p, "hidden").input, await load(pair.a, p), await load(pair.b, p), spec.rubric),
    read: (_p, content) => {
      const verdict = parseVerdict(content);
      return verdict
        ? { state: "ok", summary: verdict, blocking: [], warnings: [] }
        : { state: "rejected", summary: null, blocking: ["verdict did not parse"], warnings: [] };
    },
  }));
}

/** One minute's work: start calls for every open request, oldest first, until the time slice or the work runs out. */
export async function runEvalTick(env: Env, now = Date.now()): Promise<EvalTickResult> {
  await ensureSchema(env.DB);
  const db = env.DB;
  const nowIso = new Date(now).toISOString();
  const { results: open } = await db
    .prepare(`SELECT id, spec_json, cap_usd, state, spent_usd FROM eval_requests WHERE state IN ('queued', 'running') ORDER BY created_at ASC LIMIT 10`)
    .all<RequestRow>();
  if (!open?.length) return { request: null, written: 0, remaining: 0, spent_usd: 0 };

  // A claim left by a tick that died (its calls cannot still be running) goes back to the pool.
  const staleBefore = new Date(now - CLAIM_STALE_MS).toISOString();
  const work: Array<{ req: OpenRequest; task: Task }> = [];
  const requests: OpenRequest[] = [];
  for (const row of open) {
    let spec: AnySpec;
    let tasks: Task[];
    try {
      spec = JSON.parse(row.spec_json) as AnySpec;
      if (spec.kind === "judge") {
        if (!Array.isArray(spec.pairs) || !spec.judge) throw new Error("judge spec needs judge and pairs");
        tasks = judgeTasks(db, spec);
      } else {
        if (!Array.isArray(spec.bills) || !Array.isArray(spec.candidates) || !spec.candidates.length) throw new Error("spec needs bills and candidates");
        tasks = writeTasks(spec);
      }
    } catch (err: unknown) {
      await finish(db, row.id, "failed", messageOf(err));
      continue;
    }
    await db.prepare(`DELETE FROM eval_outputs WHERE request_id = ? AND state = 'running' AND created_at < ?`).bind(row.id, staleBefore).run();
    const { results } = await db.prepare(`SELECT item_key FROM eval_outputs WHERE request_id = ?`).bind(row.id).all<{ item_key: string }>();
    const taken = new Set((results ?? []).map((r) => r.item_key));
    const req: OpenRequest = {
      row,
      spec,
      tasks,
      // A judge needs the CRS text to show the CRS contestant; it hides CRS from its own sources (judgeTasks).
      crs: spec.kind === "judge" ? "given" : spec.crs,
      capped: false,
      prepared: new Map(),
    };
    requests.push(req);
    for (const task of tasks) if (!taken.has(task.key)) work.push({ req, task });
  }

  let written = 0;
  const startedBy = now + START_CALLS_FOR_MS;
  const queue = [...work];

  async function worker(): Promise<void> {
    for (;;) {
      if (Date.now() > startedBy) return;
      const next = queue.shift();
      if (!next) return;
      if (next.req.capped) continue;
      if (await runTask(next.req, next.task)) written += 1;
    }
  }

  async function runTask(req: OpenRequest, task: Task): Promise<boolean> {
    // Claim the call: another tick may have taken it since this one read the list.
    const claimed = await db
      .prepare(
        `INSERT OR IGNORE INTO eval_outputs (request_id, item_key, bill_id, candidate, run, model, state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`
      )
      .bind(req.row.id, task.key, task.bill, task.candidate, task.run, task.model.id, new Date().toISOString())
      .run();
    if ((claimed.meta?.changes ?? 0) !== 1) return false;

    let p: PreparedBill;
    let messages: DigestMessages;
    try {
      if (!req.prepared.has(task.bill)) req.prepared.set(task.bill, prepareBill(env, parseBillId(task.bill)).then((x) => asSeen(x, req.crs)));
      p = await req.prepared.get(task.bill)!;
      if (p.parts.length > 0) throw new Error("long bill (split into parts): not supported in eval rounds");
      messages = await task.messages(p);
    } catch (err: unknown) {
      await saveOutput(db, req.row.id, task, { state: "failed", model: task.model.id, error: `prepare: ${messageOf(err)}` });
      return true;
    }
    // The cap assumes the full output allowance (estimateCost does so for "anthropic" models): reasoning models run
    // well past the summary writer's 4k guess (Gemini 4 Hydrogen cost ~1.6x that estimate in round 8).
    const estimate = round6(estimateCost({ ...task.model, provider: "anthropic" }, [messages], "direct"));
    // Reserve the estimate in one statement, so ticks running side by side never pass the cap together. spent_usd
    // holds settled charges plus the estimates of calls still out.
    const reserved = await db
      .prepare(
        `UPDATE eval_requests SET spent_usd = spent_usd + ?, state = 'running', started_at = COALESCE(started_at, ?)
         WHERE id = ? AND state IN ('queued', 'running') AND spent_usd + ? <= cap_usd`
      )
      .bind(estimate, new Date().toISOString(), req.row.id, estimate)
      .run();
    if ((reserved.meta?.changes ?? 0) !== 1) {
      req.capped = true;
      await db.prepare(`DELETE FROM eval_outputs WHERE request_id = ? AND item_key = ? AND state = 'running'`).bind(req.row.id, task.key).run();
      return false;
    }
    let cost = 0;
    try {
      const reply = await chatCompletion(env, task.model, messages, {
        estimate,
        record: async (usd) => {
          cost += usd;
        },
      });
      const out = task.read(p, reply.content);
      await saveOutput(db, req.row.id, task, {
        ...out,
        model: task.model.id,
        content: reply.content,
        cost,
        promptTokens: reply.usage.promptTokens,
        completionTokens: reply.usage.completionTokens,
        inputs: { ...inputsRecord(p), crs_given: req.crs === "given", fingerprint: p.fingerprint, prompt_version: promptVersionOf(req.spec, task) },
      });
    } catch (err: unknown) {
      await saveOutput(db, req.row.id, task, { state: "failed", model: task.model.id, cost, error: messageOf(err) });
    } finally {
      // Settle the reservation to the charge.
      await db.prepare(`UPDATE eval_requests SET spent_usd = spent_usd + ? WHERE id = ?`).bind(round6(cost - estimate), req.row.id).run();
    }
    return true;
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // Close each request whose calls have all finished (in this tick or another).
  let remaining = 0;
  let last: { id: string; state: string; spent: number } | null = null;
  for (const req of requests) {
    const counts = await db
      .prepare(
        `SELECT COUNT(*) AS rows, SUM(CASE WHEN state = 'running' THEN 1 ELSE 0 END) AS running FROM eval_outputs WHERE request_id = ?`
      )
      .bind(req.row.id)
      .first<{ rows: number; running: number | null }>();
    const left = req.tasks.length - (counts?.rows ?? 0);
    const running = counts?.running ?? 0;
    remaining += left + running;
    const after = await db.prepare(`SELECT spent_usd FROM eval_requests WHERE id = ?`).bind(req.row.id).first<{ spent_usd: number }>();
    let state = "running";
    if (running === 0 && left === 0) {
      state = "done";
      await finish(db, req.row.id, "done", null);
    } else if (running === 0 && req.capped) {
      state = "capped";
      await finish(db, req.row.id, "capped", `spend cap $${req.row.cap_usd} reached with ${left} left`);
    }
    last = { id: req.row.id, state, spent: round6(after?.spent_usd ?? 0) };
  }
  return { request: last?.id ?? null, written, remaining, spent_usd: last?.spent ?? 0, ...(last ? { state: last.state } : {}) };
}

function promptVersionOf(spec: AnySpec, task: Task): string {
  if (spec.kind === "judge") return `judge-${spec.rubric ?? "v1"}`;
  const c = spec.candidates.find((x) => x.key === task.candidate);
  return c?.prompt ? `eval:${c.prompt}` : PROMPT_VERSION;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

async function saveOutput(
  db: D1Database,
  requestId: string,
  item: { key: string; bill: string; candidate: string; run: number },
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
      item.candidate,
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
