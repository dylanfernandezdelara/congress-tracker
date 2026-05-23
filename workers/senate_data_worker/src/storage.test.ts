import { describe, expect, it, vi } from "vitest";
import {
  buildBillEvidenceKey,
  buildBillNarrativeKey,
  buildBillTrendSnapshotKey,
  buildCoverageSnapshotKey,
  buildLatestKey,
  buildMetaKey,
  buildSnapshotKey,
  buildStateKeys,
  publishToR2,
  readJsonFromR2,
  writeJsonToR2IfChanged,
  writeTextToR2IfMissing,
} from "./storage";
import type { MetaJson, SnapshotJson } from "./types";

describe("R2 key layout helpers", () => {
  it("normalizes state to uppercase for all keys", () => {
    const keys = buildStateKeys("ny", "2025-12-18");

    expect(keys.latest).toBe("state/NY/latest.json");
    expect(keys.snapshot).toBe("state/NY/2025-12-18.json");
    expect(keys.meta).toBe("state/NY/_meta.json");
  });

  it("builds individual keys consistently", () => {
    expect(buildLatestKey("ny")).toBe("state/NY/latest.json");
    expect(buildSnapshotKey("ny", "2025-12-18")).toBe(
      "state/NY/2025-12-18.json"
    );
    expect(buildMetaKey("ny")).toBe("state/NY/_meta.json");
  });

  it("builds bill evidence and trend keys", () => {
    expect(buildBillEvidenceKey("119-s-210")).toBe("bills/evidence/119-s-210.json");
    expect(buildBillNarrativeKey("119-s-210")).toBe("bills/narrative/119-s-210.json");
    expect(buildBillTrendSnapshotKey(119, "119-s-210", "2026-02-18")).toBe(
      "bills/trends/119/119-s-210/2026-02-18.json"
    );
    expect(buildCoverageSnapshotKey("2026-02-18")).toBe("stats/coverage/2026-02-18.json");
  });
});

describe("publishToR2", () => {
  const snapshot: SnapshotJson = {
    state: "NY",
    vote_date: "2025-12-18",
    generated_at: "2026-01-05T00:00:00.000Z",
    congress: 119,
    session: 1,
    votes: [],
  };

  const keys = buildStateKeys(snapshot.state, snapshot.vote_date);

  const meta: MetaJson = {
    state: snapshot.state,
    congress: 119,
    session: 1,
    generated_at: snapshot.generated_at,
    cutoff_date_et: "2026-01-05",
    target_vote_date: snapshot.vote_date,
    keys: {
      latest: keys.latest,
      snapshot: keys.snapshot,
    },
    stats: {
      votes_total: 0,
      votes_with_state_members: 0,
      state_member_votes: 0,
    },
    partial: false,
    missing_votes: [],
  };

  it("writes snapshot, then latest, then meta with JSON content type", async () => {
    const put = vi.fn();
    const bucket = { get: vi.fn(async () => null), put } as unknown as R2Bucket;

    await publishToR2(bucket, snapshot, meta);

    expect(put).toHaveBeenCalledTimes(3);
    expect(put.mock.calls[0][0]).toBe(keys.snapshot);
    expect(put.mock.calls[1][0]).toBe(keys.latest);
    expect(put.mock.calls[2][0]).toBe(keys.meta);

    // Ensure Content-Type is set for JSON writes
    for (const call of put.mock.calls) {
      expect(call[2]).toEqual({
        httpMetadata: { contentType: "application/json" },
      });
    }
  });

  it("skips unchanged JSON while ignoring volatile run timestamps", async () => {
    const put = vi.fn();
    const bucket = {
      get: vi.fn(async () => ({
        text: async () =>
          JSON.stringify({
            generated_at: "2026-01-05T00:00:00.000Z",
            run_id: "run-old",
            items: [{ id: "vote-1", title: "Same vote" }],
          }),
      })),
      put,
    } as unknown as R2Bucket;

    await writeJsonToR2IfChanged(bucket, "briefings/latest.json", {
      generated_at: "2026-01-05T01:00:00.000Z",
      run_id: "run-new",
      items: [{ id: "vote-1", title: "Same vote" }],
    });

    expect(put).not.toHaveBeenCalled();
  });

  it("writes changed JSON when stable data differs", async () => {
    const put = vi.fn();
    const bucket = {
      get: vi.fn(async () => ({
        text: async () => JSON.stringify({ items: [{ id: "vote-1" }] }),
      })),
      put,
    } as unknown as R2Bucket;

    await writeJsonToR2IfChanged(bucket, "briefings/latest.json", {
      items: [{ id: "vote-2" }],
    });

    expect(put).toHaveBeenCalledTimes(1);
  });

  it("skips source artifacts that already exist", async () => {
    const put = vi.fn();
    const bucket = {
      head: vi.fn(async () => ({ key: "sources/govinfo/example.txt" })),
      put,
    } as unknown as R2Bucket;

    await writeTextToR2IfMissing(bucket, "sources/govinfo/example.txt", "cached");

    expect(put).not.toHaveBeenCalled();
  });
});

describe("readJsonFromR2", () => {
  it("returns parsed JSON or null when missing", async () => {
    const bucket = {
      get: vi.fn(async (key: string) => {
        if (key === "exists") {
          return {
            text: async () => '{"ok":true}',
          };
        }
        return null;
      }),
    } as unknown as R2Bucket;

    const found = await readJsonFromR2<{ ok: boolean }>(bucket, "exists");
    expect(found).toEqual({ ok: true });

    const missing = await readJsonFromR2(bucket, "missing");
    expect(missing).toBeNull();
  });

  it("returns null for invalid JSON payload", async () => {
    const bucket = {
      get: vi.fn(async () => ({
        text: async () => "{broken-json",
      })),
    } as unknown as R2Bucket;

    const parsed = await readJsonFromR2(bucket, "invalid");
    expect(parsed).toBeNull();
  });

  it("returns null for empty JSON payload", async () => {
    const bucket = {
      get: vi.fn(async () => ({
        text: async () => "   ",
      })),
    } as unknown as R2Bucket;

    const parsed = await readJsonFromR2(bucket, "empty");
    expect(parsed).toBeNull();
  });

  it("returns null when bucket.get throws (resilient to R2 runtime flakes)", async () => {
    const bucket = {
      get: vi.fn(async () => {
        throw new Error("internal error; reference = test");
      }),
    } as unknown as R2Bucket;

    const parsed = await readJsonFromR2(bucket, "any-key");
    expect(parsed).toBeNull();
  });
});

