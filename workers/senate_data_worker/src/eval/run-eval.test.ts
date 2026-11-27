import { beforeEach, describe, expect, it, vi } from "vitest";
import { asSeen, itemsOf, parseBillId, runEvalTick, type EvalSpec } from "./run-eval";

const mockPrepare = vi.fn();
const mockChat = vi.fn();

vi.mock("../d1/schema", () => ({ ensureSchema: async () => undefined }));
vi.mock("../digest/prepare", () => ({ prepareBill: (...a: unknown[]) => mockPrepare(...a) }));
vi.mock("../digest/openrouter-client", () => ({ chatCompletion: (...a: unknown[]) => mockChat(...a) }));

/** Just enough of D1 for the eval runner's statements (one table each, statements matched by their SQL). */
function fakeDb(requests: Array<Record<string, unknown>>) {
  const outputs = new Map<string, Record<string, unknown>>();
  const open = () => requests.filter((r) => ["queued", "running"].includes(r.state as string));
  const db = {
    requests,
    outputs,
    prepare(sql: string) {
      const q = sql.replace(/\s+/g, " ").trim();
      let args: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => ((args = a), stmt),
        async first() {
          if (/^SELECT summary_json FROM eval_outputs/.test(q)) {
            const o = outputs.get(`${args[0]}|${args[1]}`);
            return o ? { summary_json: o.summary_json ?? null } : null;
          }
          if (/^SELECT COUNT\(\*\)/.test(q)) {
            const rows = [...outputs.values()].filter((o) => o.request_id === args[0]);
            return { rows: rows.length, running: rows.filter((o) => o.state === "running").length };
          }
          if (/^SELECT spent_usd FROM eval_requests/.test(q)) return requests.find((r) => r.id === args[0]) ?? null;
          throw new Error(`fake D1: no first() for ${q}`);
        },
        async all() {
          if (/FROM eval_requests WHERE state IN/.test(q)) return { results: open() };
          if (/^SELECT item_key FROM eval_outputs/.test(q)) {
            return { results: [...outputs.values()].filter((o) => o.request_id === args[0]).map((o) => ({ item_key: o.item_key })) };
          }
          throw new Error(`fake D1: no all() for ${q}`);
        },
        async run() {
          const changed = (n: number) => ({ meta: { changes: n } });
          if (/^INSERT OR IGNORE INTO eval_outputs/.test(q)) {
            const [request_id, item_key, bill_id, candidate, run, model, created_at] = args;
            const k = `${request_id}|${item_key}`;
            if (outputs.has(k)) return changed(0);
            outputs.set(k, { request_id, item_key, bill_id, candidate, run, model, state: "running", created_at });
            return changed(1);
          }
          if (/^INSERT OR REPLACE INTO eval_outputs/.test(q)) {
            const [request_id, item_key, bill_id, candidate, run, model, state] = args;
            outputs.set(`${request_id}|${item_key}`, {
              request_id, item_key, bill_id, candidate, run, model, state,
              summary_json: args[8], blocking_json: args[9], cost: args[11], error: args[15], created_at: args[16],
            });
            return changed(1);
          }
          if (/^DELETE FROM eval_outputs WHERE request_id = \? AND state = 'running' AND created_at < \?/.test(q)) {
            for (const [k, o] of outputs) if (o.request_id === args[0] && o.state === "running" && (o.created_at as string) < (args[1] as string)) outputs.delete(k);
            return changed(1);
          }
          if (/^DELETE FROM eval_outputs WHERE request_id = \? AND item_key = \?/.test(q)) {
            const k = `${args[0]}|${args[1]}`;
            if (outputs.get(k)?.state === "running") outputs.delete(k);
            return changed(1);
          }
          if (/^UPDATE eval_requests SET spent_usd = spent_usd \+ \?, state = 'running'/.test(q)) {
            const [est, , id] = args as [number, string, string];
            const r = open().find((x) => x.id === id);
            if (!r || (r.spent_usd as number) + est > (r.cap_usd as number)) return changed(0);
            Object.assign(r, { spent_usd: (r.spent_usd as number) + est, state: "running" });
            return changed(1);
          }
          if (/^UPDATE eval_requests SET spent_usd = spent_usd \+ \? WHERE id = \?/.test(q)) {
            const r = requests.find((x) => x.id === args[1])!;
            r.spent_usd = Math.round(((r.spent_usd as number) + (args[0] as number)) * 1e6) / 1e6;
            return changed(1);
          }
          if (/^UPDATE eval_requests SET state = \?, error = \?/.test(q)) {
            const [state, error, , id] = args;
            Object.assign(requests.find((x) => x.id === id)!, { state, error });
            return changed(1);
          }
          throw new Error(`fake D1: no run() for ${q}`);
        },
      };
      return stmt;
    },
  };
  return db;
}

const prepared = (crs = true) => ({
  ref: { congress: 119, type: "HR", number: 2140 },
  input: {
    congress: 119, type: "HR", number: 2140, title: "Diesel Emissions Reduction Act of 2025", sponsorName: null,
    status: { stage: "passed_chamber", label: "Passed the House" }, committees: [], policyArea: null, votes: [],
    crs: crs ? { version: "Introduced in House", text: "This bill reauthorizes through FY2029 a diesel program." } : null,
    textVersion: { type: "Engrossed in House", date: "2026-09-15" },
    text: "SEC. 2. Section 797(a) of the Energy Policy Act of 2005 is amended by striking “2024” and inserting “2029”.",
  },
  parts: [], totalTokens: 100, basis: "text",
  checkSources: { type: "HR", title: "Diesel Emissions Reduction Act of 2025", crsText: crs ? "This bill reauthorizes through FY2029 a diesel program." : null, text: "striking 2024 and inserting 2029", statusLabel: "Passed the House" },
  fingerprint: "abc", bundle: {},
});

const reply = JSON.stringify({
  headline: "Bill would extend a diesel engine grant program to 2029",
  what_it_does: "Extends a federal program that pays to replace old diesel engines, from 2024 to 2029.",
  who_it_affects: ["Diesel engine owners"],
  key_points: [{ text: "Changes the program's end year from 2024 to 2029.", section: "Sec. 2" }],
});

const spec: EvalSpec = {
  round: "t",
  bills: ["119-hr-2140"],
  candidates: [
    { key: "luna", model: "openai/gpt-6-luna", price: { input: 0.1, output: 0.5 } },
    { key: "haiku", model: "anthropic/claude-haiku-5.5", price: { input: 0.1, output: 0.5 } },
  ],
};

describe("eval spec helpers", () => {
  it("parses bill ids and expands items", () => {
    expect(parseBillId("119-hjres-213")).toEqual({ congress: 119, type: "HJRES", number: 213 });
    expect(itemsOf({ ...spec, runs: 2 }).map((i) => i.key)).toEqual([
      "119-hr-2140|luna|1", "119-hr-2140|luna|2", "119-hr-2140|haiku|1", "119-hr-2140|haiku|2",
    ]);
  });

  it("hides CRS from the model and from the checks unless the round gives it", () => {
    const p = prepared() as never;
    const hidden = asSeen(p, undefined);
    expect(hidden.input.crs).toBeNull();
    expect(hidden.checkSources.crsText).toBeNull();
    expect(asSeen(p, "given").input.crs).not.toBeNull();
  });
});

describe("runEvalTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepare.mockResolvedValue(prepared());
    mockChat.mockImplementation(async (_env, _model, messages, spend) => {
      await spend.record(spend.estimate);
      await spend.record(0.0004 - spend.estimate);
      return { content: reply, usage: { cost: 0.0004, promptTokens: 900, completionTokens: 300 }, generationId: "g", gatewayLogId: null };
    });
  });

  it("does nothing when no request is waiting", async () => {
    const db = fakeDb([]);
    expect(await runEvalTick({ DB: db } as never)).toMatchObject({ request: null, written: 0 });
    expect(mockChat).not.toHaveBeenCalled();
  });

  it("writes every item, never shows the model the CRS, records spend, and finishes", async () => {
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify(spec), cap_usd: 1, state: "queued", spent_usd: 0, lease_until: null }]);
    const result = await runEvalTick({ DB: db } as never);
    expect(result).toMatchObject({ request: "r1", written: 2, remaining: 0, state: "done" });
    expect(db.requests[0]).toMatchObject({ state: "done", spent_usd: 0.0008 });
    expect([...db.outputs.values()].map((o) => o.state)).toEqual(["ok", "ok"]);
    const userPrompt = mockChat.mock.calls[0]![2].user as string;
    expect(userPrompt).not.toContain("reauthorizes through FY2029");
  });

  it("skips items already written (a later minute continues the request)", async () => {
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify(spec), cap_usd: 1, state: "running", spent_usd: 0.0004, lease_until: null }]);
    db.outputs.set("r1|119-hr-2140|luna|1", { request_id: "r1", item_key: "119-hr-2140|luna|1" });
    const result = await runEvalTick({ DB: db } as never);
    expect(result.written).toBe(1);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it("stops at the spend cap before a call that would pass it", async () => {
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify(spec), cap_usd: 0.0001, state: "queued", spent_usd: 0, lease_until: null }]);
    const result = await runEvalTick({ DB: db } as never);
    expect(result).toMatchObject({ written: 0, state: "capped" });
    expect(mockChat).not.toHaveBeenCalled();
    expect(db.requests[0]!.state).toBe("capped");
  });

  it("lets ticks that overlap share a request without running a call twice", async () => {
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify({ ...spec, runs: 3 }), cap_usd: 1, state: "queued", spent_usd: 0 }]);
    await Promise.all([runEvalTick({ DB: db } as never), runEvalTick({ DB: db } as never), runEvalTick({ DB: db } as never)]);
    expect(mockChat).toHaveBeenCalledTimes(6);
    expect([...db.outputs.values()].every((o) => o.state === "ok")).toBe(true);
    expect(db.requests[0]).toMatchObject({ state: "done", spent_usd: 0.0024 });
  });

  it("reserves each call's estimate against the cap, so overlapping ticks cannot pass it together", async () => {
    const probe = fakeDb([{ id: "p", spec_json: JSON.stringify({ ...spec, candidates: [spec.candidates[0]] }), cap_usd: 1, state: "queued", spent_usd: 0 }]);
    await runEvalTick({ DB: probe } as never);
    const estimate = mockChat.mock.calls[0]![3].estimate as number;
    mockChat.mockClear();
    // Room for one call's estimate, not two: the second claim waits for nothing and is refused.
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify(spec), cap_usd: estimate * 1.5, state: "queued", spent_usd: 0 }]);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockChat.mockImplementation(async (_env, _model, _messages, spend) => {
      await gate;
      await spend.record(0.0004);
      return { content: reply, usage: { cost: 0.0004, promptTokens: 900, completionTokens: 300 }, generationId: null, gatewayLogId: null };
    });
    const ticks = Promise.all([runEvalTick({ DB: db } as never), runEvalTick({ DB: db } as never)]);
    await new Promise((r) => setTimeout(r, 0));
    release();
    await ticks;
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect([...db.outputs.values()].map((o) => o.state)).toEqual(["ok"]);
  });

  it("reclaims a call whose tick died", async () => {
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify(spec), cap_usd: 1, state: "running", spent_usd: 0 }]);
    db.outputs.set("r1|119-hr-2140|luna|1", { request_id: "r1", item_key: "119-hr-2140|luna|1", state: "running", created_at: "2026-01-01T00:00:00.000Z" });
    await runEvalTick({ DB: db } as never);
    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(db.requests[0]!.state).toBe("done");
  });

  it("records a failed call and a rejected reply without stopping the round", async () => {
    mockChat.mockRejectedValueOnce(new Error("provider 503")).mockResolvedValueOnce({
      content: "not json", usage: { cost: 0.0001, promptTokens: 1, completionTokens: 1 }, generationId: null, gatewayLogId: null,
    });
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify(spec), cap_usd: 1, state: "queued", spent_usd: 0, lease_until: null }]);
    const result = await runEvalTick({ DB: db } as never);
    expect(result.state).toBe("done");
    const states = [...db.outputs.values()].map((o) => `${o.candidate}:${o.state}`).sort();
    expect(states).toEqual(["haiku:rejected", "luna:failed"]);
  });

  it("writes with the candidate's prompt version, which keeps the same reply format", async () => {
    mockChat.mockImplementationOnce(async () => ({
      content: JSON.stringify({ reader_questions: { main_subject: "diesel grants" }, ...JSON.parse(reply) }),
      usage: { cost: 0.0004, promptTokens: 900, completionTokens: 300 }, generationId: null, gatewayLogId: null,
    }));
    const v = { ...spec, candidates: [{ ...spec.candidates[0]!, key: "luna-plan", prompt: "v4-plan" }, spec.candidates[0]!] };
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify(v), cap_usd: 1, state: "queued", spent_usd: 0, lease_until: null }]);
    await runEvalTick({ DB: db } as never);
    const prompts = mockChat.mock.calls.map((c) => c[2].user as string);
    expect(prompts[0]).toContain("READER FOCUS");
    expect(prompts[0]).toContain('"reader_questions"');
    expect(prompts[1]).not.toContain("READER FOCUS");
    expect([...db.outputs.values()].map((o) => `${o.candidate}:${o.state}`)).toEqual(["luna-plan:ok", "luna:ok"]);
  });

  it("fails a request that names an unknown prompt version", async () => {
    const v = { ...spec, candidates: [{ ...spec.candidates[0]!, prompt: "v9" }] };
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify(v), cap_usd: 1, state: "queued", spent_usd: 0, lease_until: null }]);
    await runEvalTick({ DB: db } as never);
    expect(db.requests[0]!.state).toBe("failed");
    expect(db.requests[0]!.error).toMatch(/unknown prompt version/);
  });

  it("judges a pair: a stored summary against CRS, with CRS kept out of the judge's sources", async () => {
    mockChat.mockImplementation(async () => ({
      content: JSON.stringify({ errors_a: [], errors_b: ["none"], comparison: "A names the change.", winner: "a", margin: "clear" }),
      usage: { cost: 0.002, promptTokens: 2000, completionTokens: 200 }, generationId: null, gatewayLogId: null,
    }));
    const judge = {
      kind: "judge", round: "j",
      judge: { key: "sonnet", model: "anthropic/claude-sonnet-5.5", price: { input: 2, output: 10 } },
      pairs: [{ key: "p1", bill: "119-hr-2140", a: { request: "w1", item: "119-hr-2140|luna|1" }, b: { crs: true } }],
    };
    const db = fakeDb([{ id: "j1", spec_json: JSON.stringify(judge), cap_usd: 1, state: "queued", spent_usd: 0, lease_until: null }]);
    db.outputs.set("w1|119-hr-2140|luna|1", { request_id: "w1", item_key: "119-hr-2140|luna|1", summary_json: JSON.stringify({ headline: "Bill would extend diesel grants", what_it_does: "Extends it.", key_points: [] }) });
    expect(await runEvalTick({ DB: db } as never)).toMatchObject({ written: 1, state: "done" });
    const user = mockChat.mock.calls[0]![2].user as string;
    expect(user).toContain("Title: Bill would extend diesel grants");
    expect(user.split("reauthorizes through FY2029").length - 1).toBe(1); // as summary B only
    expect(user.indexOf("reauthorizes through FY2029")).toBeGreaterThan(user.indexOf("SUMMARY B:"));
    const out = db.outputs.get("j1|p1")!;
    expect(out.state).toBe("ok");
    expect(JSON.parse(out.summary_json as string)).toMatchObject({ winner: "A", margin: "clear", errors_b: [] });
  });

  it("records a judge pair whose summary is missing as failed", async () => {
    const judge = {
      kind: "judge", round: "j",
      judge: { key: "sonnet", model: "anthropic/claude-sonnet-5.5", price: { input: 2, output: 10 } },
      pairs: [{ key: "p1", bill: "119-hr-2140", a: { request: "w1", item: "nope" }, b: { crs: true } }],
    };
    const db = fakeDb([{ id: "j1", spec_json: JSON.stringify(judge), cap_usd: 1, state: "queued", spent_usd: 0, lease_until: null }]);
    await runEvalTick({ DB: db } as never);
    expect(db.outputs.get("j1|p1")).toMatchObject({ state: "failed" });
    expect(mockChat).not.toHaveBeenCalled();
  });
});
