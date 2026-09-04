import { describe, expect, it } from "vitest";
import { buildIngestMonitorPayload, evaluateIngestMonitorStatus } from "./ingest-health";

describe("evaluateIngestMonitorStatus", () => {
  const now = new Date("2026-06-23T12:00:00.000Z");

  it("marks ok when scheduled success is recent and no newer failure", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 2,
        digestsSkipped: 3,
      },
      lastFailure: null,
    });
    expect(result.status).toBe("ok");
  });

  it("marks failed when failure is newer than scheduled success", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess: {
        completed_at: "2026-06-22T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 0,
        digestsSkipped: 5,
      },
      lastFailure: {
        failed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        error: "HTTP 403 for https://api.congress.gov/v3/bill/119/hr/1?format=json&api_key=secret",
      },
    });
    expect(result.status).toBe("failed");
    expect(result.message).not.toContain("secret");
    expect(result.message).toContain("api.congress.gov");
  });

  it("marks stale when scheduled success is too old", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess: {
        completed_at: "2026-06-20T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 0,
        digestsSkipped: 5,
      },
      lastFailure: null,
    });
    expect(result.status).toBe("stale");
  });

  it("ignores admin failures when scheduled ingest succeeded", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 2,
        digestsSkipped: 3,
      },
      lastFailure: {
        failed_at: "2026-06-23T11:00:00.000Z",
        trigger: "admin",
        error: "Manual run failed",
      },
    });
    expect(result.status).toBe("ok");
  });

  it("marks unknown when no scheduled success exists", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "admin",
        votesUpserted: 1,
        votesSkipped: 0,
        billsSelected: 1,
        digestsWritten: 1,
        digestsSkipped: 0,
      },
      lastFailure: null,
    });
    expect(result.status).toBe("unknown");
  });

  it("marks degraded for Senate cache-fallback chamber warnings", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 2,
        digestsSkipped: 3,
      },
      lastFailure: null,
      chamberWarnings: [
        "Senate vote menu served from D1 cache after live fetch failed: HTTP 403",
      ],
    });
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("Partial chamber ingest");
  });

  it("marks failed for hard chamber skip warnings (page-worthy)", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 2,
        digestsSkipped: 3,
      },
      lastFailure: null,
      chamberWarnings: ["House ingest skipped: Congress API down"],
    });
    expect(result.status).toBe("failed");
    expect(result.message).toContain("House ingest skipped");
  });

  it("marks failed when Senate menu cache is nearing expiry", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 2,
        digestsSkipped: 3,
      },
      lastFailure: null,
      chamberWarnings: [
        "Senate vote menu served from D1 cache after live fetch failed: HTTP 403",
      ],
      senateVoteMenuCache: {
        fetched_at: "2026-06-17T10:00:00.000Z",
        age_hours: 146,
        max_age_hours: 168,
        stale: true,
        nearing_expiry: true,
        expired: false,
      },
    });
    expect(result.status).toBe("failed");
    expect(result.message).toContain("nearing expiry");
  });

  it("marks degraded when Senate menu cache is stale without chamber warnings", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 2,
        digestsSkipped: 3,
      },
      lastFailure: null,
      senateVoteMenuCache: {
        fetched_at: "2026-06-20T10:00:00.000Z",
        age_hours: 74,
        max_age_hours: 168,
        stale: true,
        nearing_expiry: false,
        expired: false,
      },
    });
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("stale");
  });
});

describe("buildIngestMonitorPayload", () => {
  const now = new Date("2026-06-23T12:00:00.000Z");

  const executiveScheduled = {
    completed_at: "2026-06-23T11:20:00.000Z",
    trigger: "scheduled" as const,
    fetched: 3,
    ingested: 2,
    linked: 1,
    hydrated: 1,
    skipped: 0,
  };
  const executiveAdmin = {
    completed_at: "2026-06-23T11:45:00.000Z",
    trigger: "admin" as const,
    fetched: 1,
    ingested: 1,
    linked: 0,
    hydrated: 0,
    skipped: 0,
  };

  it("marks degraded when scheduled success carried cache-fallback chamber_warnings", () => {
    const lastScheduled = {
      completed_at: "2026-06-23T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 0,
      votesSkipped: 10,
      billsSelected: 5,
      digestsWritten: 2,
      digestsSkipped: 3,
      chamber_warnings: [
        "Senate vote menu served from D1 cache after live fetch failed: HTTP 403",
      ],
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-20",
      missingDigestCount: 1,
      lastSuccess: lastScheduled,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: null,
    });

    expect(payload.status).toBe("degraded");
    expect(payload.message).toContain("Partial chamber ingest");
    expect(payload.message).toContain("1 feed bill(s) missing digests");
    expect(payload.message).toContain("Floor has been quiet since 2026-06-20");
    expect(payload.floor_quiet_days).toBe(3);
  });

  it("marks degraded when scheduled success carried House truncation warnings", () => {
    const lastScheduled = {
      completed_at: "2026-06-23T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 2,
      votesSkipped: 10,
      billsSelected: 5,
      digestsWritten: 2,
      digestsSkipped: 3,
      chamber_warnings: [
        "House ingest truncated: per-run fetch cap reached; remaining unknown rolls retry next run (newest first).",
      ],
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-22",
      missingDigestCount: 0,
      lastSuccess: lastScheduled,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: null,
    });

    expect(payload.status).toBe("degraded");
    expect(payload.message).toContain("ingest truncated");
    expect(payload.message).not.toContain("Floor has been quiet");
  });

  it("marks failed when scheduled success carried hard chamber skip warnings", () => {
    const lastScheduled = {
      completed_at: "2026-06-23T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 0,
      votesSkipped: 10,
      billsSelected: 5,
      digestsWritten: 2,
      digestsSkipped: 3,
      chamber_warnings: ["Senate ingest skipped: HTTP 403"],
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-20",
      missingDigestCount: 0,
      lastSuccess: lastScheduled,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: null,
    });

    expect(payload.status).toBe("failed");
    expect(payload.message).toContain("Senate ingest skipped");
  });

  it("uses newer admin success chamber_warnings so menu refresh clears sticky hard-skip failed", () => {
    const lastScheduled = {
      completed_at: "2026-06-23T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 0,
      votesSkipped: 10,
      billsSelected: 5,
      digestsWritten: 2,
      digestsSkipped: 3,
      chamber_warnings: ["Senate ingest skipped: HTTP 403"],
    };
    const lastAdmin = {
      completed_at: "2026-06-23T11:30:00.000Z",
      trigger: "admin" as const,
      votesUpserted: 2,
      votesSkipped: 8,
      billsSelected: 5,
      digestsWritten: 1,
      digestsSkipped: 4,
      chamber_warnings: [
        "Senate vote menu served from D1 cache after live fetch failed: HTTP 403",
      ],
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-20",
      missingDigestCount: 0,
      lastSuccess: lastAdmin,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: null,
    });

    expect(payload.status).toBe("degraded");
    expect(payload.message).toContain("served from D1 cache");
    expect(payload.last_scheduled_success?.completed_at).toBe(lastScheduled.completed_at);
  });

  it("clears to ok when newer admin success has no chamber_warnings", () => {
    const lastScheduled = {
      completed_at: "2026-06-23T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 0,
      votesSkipped: 10,
      billsSelected: 5,
      digestsWritten: 2,
      digestsSkipped: 3,
      chamber_warnings: ["House ingest skipped: Congress API down"],
    };
    const lastAdmin = {
      completed_at: "2026-06-23T11:30:00.000Z",
      trigger: "admin" as const,
      votesUpserted: 2,
      votesSkipped: 8,
      billsSelected: 5,
      digestsWritten: 1,
      digestsSkipped: 4,
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-20",
      missingDigestCount: 0,
      lastSuccess: lastAdmin,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: null,
    });

    expect(payload.status).toBe("ok");
    expect(payload.floor_quiet_days).toBe(3);
    expect(payload.message).toContain("Floor has been quiet since 2026-06-20");
  });

  it("does not treat a same-day latest vote as a quiet floor", () => {
    const lastScheduled = {
      completed_at: "2026-06-23T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 2,
      votesSkipped: 4,
      billsSelected: 5,
      digestsWritten: 1,
      digestsSkipped: 4,
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-23",
      missingDigestCount: 0,
      lastSuccess: lastScheduled,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: null,
    });

    expect(payload.status).toBe("ok");
    expect(payload.floor_quiet_days).toBe(0);
    expect(payload.message).toBe("Scheduled ingest completed within the expected window.");
  });

  it("surfaces last_skipped without changing status fields", () => {
    const skipped = {
      skipped_at: "2026-06-23T10:00:35.000Z",
      trigger: "scheduled" as const,
      reason: "pipeline_busy" as const,
    };
    const lastScheduled = {
      completed_at: "2026-06-20T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 1,
      votesSkipped: 0,
      billsSelected: 1,
      digestsWritten: 1,
      digestsSkipped: 0,
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-20",
      missingDigestCount: 0,
      lastSuccess: lastScheduled,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: skipped,
    });

    expect(payload.status).toBe("stale");
    expect(payload.last_skipped).toEqual(skipped);
    expect(payload.last_scheduled_success?.completed_at).toBe(lastScheduled.completed_at);
    expect(payload.last_failure).toBeNull();
  });

  it("defaults last_skipped to null when absent", () => {
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: null,
      missingDigestCount: 0,
      lastSuccess: null,
      lastScheduledSuccess: null,
      lastFailure: null,
      lastSkipped: null,
    });
    expect(payload.last_skipped).toBeNull();
    expect(payload.status).toBe("unknown");
  });

  it("keeps executive cron health after an admin success when scheduled success is persisted separately", () => {
    // Regression: deriving scheduled success from last_success alone reports
    // unknown after any admin run, even when the hourly cron succeeded recently.
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: null,
      missingDigestCount: 0,
      lastSuccess: null,
      lastScheduledSuccess: null,
      lastFailure: null,
      lastSkipped: null,
      executive: {
        staleAfterHours: 2,
        hourlyCronUtc: "20 * * * *",
        lastSuccess: executiveAdmin,
        lastScheduledSuccess: executiveScheduled,
        lastFailure: null,
      },
    });

    expect(payload.executive?.status).toBe("ok");
    expect(payload.executive?.last_success?.trigger).toBe("admin");
    expect(payload.executive?.last_scheduled_success).toEqual(executiveScheduled);
    expect(payload.executive?.message).toContain("Scheduled ingest completed");
  });

  it("reports executive unknown when scheduled key is absent and latest success is admin (migration)", () => {
    // Pre-migration D1 has no executive_posts_pipeline_last_scheduled_success.
    // Falling back to lastSuccess must not treat an admin run as cron health.
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: null,
      missingDigestCount: 0,
      lastSuccess: null,
      lastScheduledSuccess: null,
      lastFailure: null,
      lastSkipped: null,
      executive: {
        staleAfterHours: 2,
        hourlyCronUtc: "20 * * * *",
        lastSuccess: executiveAdmin,
        lastScheduledSuccess: null,
        lastFailure: null,
      },
    });

    expect(payload.executive?.status).toBe("unknown");
    expect(payload.executive?.last_scheduled_success).toBeNull();
    expect(payload.executive?.last_success?.trigger).toBe("admin");
  });

  it("falls back to executive lastSuccess when scheduled key is null and latest is scheduled", () => {
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: null,
      missingDigestCount: 0,
      lastSuccess: null,
      lastScheduledSuccess: null,
      lastFailure: null,
      lastSkipped: null,
      executive: {
        staleAfterHours: 2,
        hourlyCronUtc: "20 * * * *",
        lastSuccess: executiveScheduled,
        lastScheduledSuccess: null,
        lastFailure: null,
      },
    });

    expect(payload.executive?.status).toBe("ok");
    expect(payload.executive?.last_scheduled_success).toEqual(executiveScheduled);
  });

  it("stays ok for a healthy intro run and exposes intros* on last_success", () => {
    const lastScheduled = {
      completed_at: "2026-06-23T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 0,
      votesSkipped: 10,
      billsSelected: 5,
      digestsWritten: 2,
      digestsSkipped: 3,
      introsDiscovered: 4,
      introsPersisted: 4,
      intro_warnings: [] as string[],
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-23",
      missingDigestCount: 0,
      lastSuccess: lastScheduled,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: null,
    });

    expect(payload.status).toBe("ok");
    expect(payload.last_success?.introsDiscovered).toBe(4);
    expect(payload.last_success?.introsPersisted).toBe(4);
    expect(payload.last_success?.intro_warnings).toEqual([]);
  });

  it("marks degraded when a post-#168 run soft-fails intro list discovery", () => {
    const lastScheduled = {
      completed_at: "2026-06-23T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 0,
      votesSkipped: 10,
      billsSelected: 5,
      digestsWritten: 2,
      digestsSkipped: 3,
      introsDiscovered: 0,
      introsPersisted: 0,
      intro_warnings: [
        "Intro list failed: HTTP 429 for https://api.congress.gov/v3/bill/119/hr?api_key=secret",
      ],
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-22",
      missingDigestCount: 0,
      lastSuccess: lastScheduled,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: null,
    });

    expect(payload.status).toBe("degraded");
    expect(payload.message).toContain("Intro discovery soft-failed");
    expect(payload.message).not.toContain("secret");
    expect(payload.last_success?.introsDiscovered).toBe(0);
    expect(payload.last_success?.introsPersisted).toBe(0);
    expect(payload.last_success?.intro_warnings?.[0]).toContain("Intro list failed");
    expect(payload.last_success?.intro_warnings?.[0]).not.toContain("secret");
  });

  it("stays ok for a legacy last_success without intros* when otherwise fresh", () => {
    const lastScheduled = {
      completed_at: "2026-06-23T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 0,
      votesSkipped: 10,
      billsSelected: 5,
      digestsWritten: 2,
      digestsSkipped: 3,
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-23",
      missingDigestCount: 0,
      lastSuccess: lastScheduled,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: null,
    });

    expect(payload.status).toBe("ok");
    expect(payload.last_success).not.toHaveProperty("introsDiscovered");
    expect(payload.last_success).not.toHaveProperty("intro_warnings");
  });
});
