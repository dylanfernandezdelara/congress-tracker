import { beforeEach, describe, expect, it, vi } from "vitest";
import { asSeen, itemsOf, parseBillId, runEvalTick, type EvalSpec } from "./run-eval";

const mockPrepare = vi.fn();
const mockChat = vi.fn();

vi.mock("../d1/schema", () => ({ ensureSchema: async () => undefined }));
vi.mock("../digest/prepare", () => ({ prepareBill: (...a: unknown[]) => mockPrepare(...a) }));
vi.mock("../digest/openrouter-client", () => ({ chatCompletion: (...a: unknown[]) => mockChat(...a) }));

/** Just enough of D1 for the eval runner's statements. */
function fakeDb(requests: Array<Record<string, unknown>>) {
  const outputs = new Map<string, Record<string, unknown>>();
  const db = {
    requests,
    outputs,
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind: (...a: unknown[]) => ((args = a), stmt),
        async first() {
          if (/FROM eval_requests/.test(sql)) {
            const [now] = args as [string];
            return requests.find((r) => ["queued", "running"].includes(r.state as string) && (!r.lease_until || (r.lease_until as string) < now)) ?? null;
          }
          return null;
        },
        async all() {
          return { results: [...outputs.values()].filter((o) => o.request_id === args[0]).map((o) => ({ item_key: o.item_key })) };
        },
        async run() {
          if (/^UPDATE eval_requests SET state = 'running'/.test(sql.trim())) {
            const [lease, , id, now] = args as string[];
            const r = requests.find((x) => x.id === id && (!x.lease_until || (x.lease_until as string) < now));
            if (!r) return { meta: { changes: 0 } };
            Object.assign(r, { state: "running", lease_until: lease });
            return { meta: { changes: 1 } };
          }
          if (/^UPDATE eval_requests SET state = \?/.test(sql.trim())) {
            const [state, error, , id] = args;
            Object.assign(requests.find((x) => x.id === id)!, { state, error, lease_until: null });
          } else if (/SET spent_usd/.test(sql)) {
            requests.find((x) => x.id === args[1])!.spent_usd = args[0];
          } else if (/SET lease_until = NULL/.test(sql)) {
            requests.find((x) => x.id === args[0])!.lease_until = null;
          } else if (/INSERT OR REPLACE INTO eval_outputs/.test(sql)) {
            const [request_id, item_key, bill_id, candidate, run, model, state] = args;
            outputs.set(`${request_id}|${item_key}`, { request_id, item_key, bill_id, candidate, run, model, state, blocking_json: args[9], cost: args[11], error: args[15] });
          }
          return { meta: { changes: 1 } };
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

  it("leaves a leased request alone", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const db = fakeDb([{ id: "r1", spec_json: JSON.stringify(spec), cap_usd: 1, state: "running", spent_usd: 0, lease_until: future }]);
    expect((await runEvalTick({ DB: db } as never)).request).toBeNull();
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
});
