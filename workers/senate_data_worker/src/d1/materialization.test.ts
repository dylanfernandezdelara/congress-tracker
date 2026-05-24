import { describe, expect, it } from "vitest";

import type { BriefingFeedResponse, VoteDetailResponse } from "../platform-types";
import { readLatestBriefingFromD1, readVoteDetailFromD1 } from "./materialization";
import { createSchemaTrackingDb } from "./test-helpers";

const briefingPayload = {
  generated_at: "2026-01-20T12:00:00Z",
  source: "d1",
  items: [
    {
      id: "119:2:14",
      congress: 119,
      session: 2,
      vote_number: 14,
      vote_date: "2026-01-17",
      title: "Border Infrastructure Modernization Act",
      summary: "Senate vote on border infrastructure.",
      outcome_label: "Passed",
      status: "passed",
      category: "legislation",
      significance: "high",
      tally: { yea: 60, nay: 40, present: 0, absent: 0 },
      crossed_party_lines: [],
      source_coverage: {
        level: "partial",
        vote_data: true,
        bill_context: true,
        congressional_record: false,
        floor_logs: false,
        model_summary: false,
      },
      detail_path: "/votes/119/2/14",
      plain_action: "Passed the bill",
      public_impact_summary: "Infrastructure funding advances.",
      content_confidence: "high",
      source_basis: [],
    },
  ],
} satisfies BriefingFeedResponse;

const voteDetailPayload = {
  generated_at: "2026-01-20T12:00:00Z",
  source: "d1",
  vote: {
    id: "119:2:14",
    congress: 119,
    session: 2,
    vote_number: 14,
    vote_date: "2026-01-17",
    title: "Border Infrastructure Modernization Act",
    question: "On Passage of the Bill",
    result: "Agreed to",
    status: "passed",
    tally: { yea: 60, nay: 40, present: 0, absent: 0 },
  },
  party_breakdown: [],
  history: {
    thread_key: "119:S:303",
    measure_recurrence_count: 1,
    issue_key: "119:S:303",
    issue_title: "Border Infrastructure Modernization Act",
    issue_recurrence_count: 1,
    related_votes: [],
  },
  source_coverage: {
    level: "partial",
    vote_data: true,
    bill_context: true,
    congressional_record: false,
    floor_logs: false,
    model_summary: false,
  },
} as unknown as VoteDetailResponse;

describe("read model payloads from D1", () => {
  it("reads briefing and vote detail JSON payloads", async () => {
    const db = createSchemaTrackingDb();
    const stores = {
      briefing: JSON.stringify(briefingPayload),
      voteDetail: JSON.stringify(voteDetailPayload),
    };

    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.includes("FROM daily_briefings")) {
        return {
          bind() {
            return {
              async run() {
                return { success: true, meta: { duration: 0 } };
              },
              async all<T>() {
                return {
                  results: [{ payload_json: stores.briefing }],
                  success: true,
                  meta: { duration: 0 },
                } as T;
              },
            } as D1PreparedStatement;
          },
        } as D1PreparedStatement;
      }
      if (normalized.includes("FROM vote_read_models")) {
        return {
          bind() {
            return {
              async run() {
                return { success: true, meta: { duration: 0 } };
              },
              async all<T>() {
                return {
                  results: [{ payload_json: stores.voteDetail }],
                  success: true,
                  meta: { duration: 0 },
                } as T;
              },
            } as D1PreparedStatement;
          },
        } as D1PreparedStatement;
      }
      if (normalized.includes("FROM argument_excerpts")) {
        return {
          bind() {
            return {
              async run() {
                return { success: true, meta: { duration: 0 } };
              },
              async all<T>() {
                return { results: [], success: true, meta: { duration: 0 } } as T;
              },
            } as D1PreparedStatement;
          },
        } as D1PreparedStatement;
      }
      if (normalized.includes("FROM party_argument_summaries")) {
        return {
          bind() {
            return {
              async run() {
                return { success: true, meta: { duration: 0 } };
              },
              async all<T>() {
                return { results: [], success: true, meta: { duration: 0 } } as T;
              },
            } as D1PreparedStatement;
          },
        } as D1PreparedStatement;
      }
      if (normalized.includes("FROM votes")) {
        return {
          bind() {
            return {
              async run() {
                return { success: true, meta: { duration: 0 } };
              },
              async all<T>() {
                return {
                  results: [{ total: 1, vote_date: "2026-01-17" }],
                  success: true,
                  meta: { duration: 0 },
                } as T;
              },
            } as D1PreparedStatement;
          },
        } as D1PreparedStatement;
      }
      return originalPrepare(sql);
    };

    const readBriefing = await readLatestBriefingFromD1(db);
    expect(readBriefing?.items).toHaveLength(1);
    expect(readBriefing?.source).toBe("d1");

    const readDetail = await readVoteDetailFromD1(db, 119, 2, 14);
    expect(readDetail?.vote.vote_number).toBe(14);
    expect(readDetail?.source).toBe("d1");
  });
});
