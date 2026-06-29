import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSchemaFlag } from "../d1/schema";
import {
  HOUSING_SAVE_LLM_RESULT,
  HOUSING_SAVE_POST_ID,
  HOUSING_SAVE_POST_TEXT,
} from "../fixtures/executive-housing-save";
import { runExecutivePostsPipeline } from "./run-executive-posts";

vi.mock("../executive/hydrate-bill", () => ({
  hydrateBillFromCongress: vi.fn(async () => true),
}));

vi.mock("../d1/pipeline-state", () => ({
  recordExecutivePostsPipelineSuccess: vi.fn(async () => {}),
  recordExecutivePostsPipelineFailure: vi.fn(async () => {}),
}));

vi.mock("../executive/build-catalog", () => ({
  buildExecutiveCandidateCatalog: vi.fn(async () => [
    {
      congress: 119,
      type: "HR",
      number: 6644,
      title: "21st Century ROAD to Housing Act",
      headline: "Housing overhaul",
      policy_area: "Housing",
    },
    {
      congress: 119,
      type: "HR",
      number: 22,
      title: "SAVE Act",
      headline: "Voter eligibility",
      policy_area: "Government operations and politics",
    },
  ]),
  ensureBillInCatalog: vi.fn(async (_env, _bill, catalog) => catalog),
}));

function createExecutiveMockDb() {
  const posts = new Map<string, Record<string, unknown>>();
  const links: Array<Record<string, unknown>> = [];

  const runResult = { success: true, meta: { duration: 0 } };
  const stmt = (sql: string) => {
    const statement = {
      sql,
      binds: [] as unknown[],
      bind(...args: unknown[]) {
        return {
          ...statement,
          binds: args,
          bind: statement.bind,
          all: statement.all,
          first: statement.first,
          run: statement.run,
        };
      },
      async all<T>() {
      if (sql.includes("FROM executive_posts WHERE id = ?")) {
        const id = this.binds[0] as string;
        const row = posts.get(id);
        return { results: row ? [row] : [] as T[] };
      }
      if (sql.includes("FROM executive_post_bills WHERE post_id = ?")) {
        const postId = this.binds[0] as string;
        return {
          results: links.filter((l) => l.post_id === postId) as T[],
        };
      }
      if (sql.includes("FROM executive_post_bills b")) {
        return { results: links as T[] };
      }
      if (sql.includes("FROM votes")) return { results: [] as T[] };
      if (sql.includes("FROM bill_digests")) return { results: [] as T[] };
      return { results: [] as T[] };
    },
    async first<T>() {
      if (sql.includes("FROM executive_posts WHERE id = ?")) {
        const id = this.binds[0] as string;
        const row = posts.get(id);
        return (row ?? null) as T | null;
      }
      return null as T | null;
    },
    async run() {
      if (sql.startsWith("INSERT INTO executive_posts")) {
        const [
          id,
          platform,
          author,
          text,
          postedAt,
          sourceUrl,
          archiveUrl,
          summary,
          rawJson,
          ingestedAt,
        ] = this.binds as string[];
        posts.set(id, {
          id,
          platform,
          author,
          text,
          posted_at: postedAt,
          source_url: sourceUrl,
          archive_url: archiveUrl,
          summary,
          raw_json: rawJson,
          ingested_at: ingestedAt,
        });
      }
      if (sql.startsWith("DELETE FROM executive_post_bills")) {
        const postId = this.binds[0] as string;
        for (let i = links.length - 1; i >= 0; i -= 1) {
          if (links[i]!.post_id === postId) links.splice(i, 1);
        }
      }
      if (sql.startsWith("INSERT INTO executive_post_bills")) {
        const [
          postId,
          billCongress,
          billType,
          billNumber,
          linkMethod,
          role,
          confidence,
          rationale,
          isPrimary,
        ] = this.binds as Array<string | number>;
        links.push({
          post_id: postId,
          bill_congress: billCongress,
          bill_type: billType,
          bill_number: billNumber,
          link_method: linkMethod,
          role,
          confidence,
          rationale,
          is_primary: isPrimary,
        });
      }
      return runResult;
    },
  };
  return statement;
  };

  return {
    db: {
      exec: vi.fn(async () => {}),
      prepare: vi.fn((sql: string) => stmt(sql)),
      batch: vi.fn(async (statements: Array<{ run: () => Promise<unknown> }>) => {
        for (const statement of statements) {
          await statement.run();
        }
      }),
    } as unknown as D1Database,
    posts,
    links,
  };
}

describe("runExecutivePostsPipeline", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("stores housing post links to SAVE Act H.R. 22", async () => {
    const { db, links, posts } = createExecutiveMockDb();
    const env = {
      DB: db,
      CONGRESS: "119",
      SESSION: "2",
      CONGRESS_API_KEY: "test",
      OPENROUTER_API_KEY: "test",
    };

    const result = await runExecutivePostsPipeline(env as any, {
      statuses: [
        {
          id: HOUSING_SAVE_POST_ID,
          text: HOUSING_SAVE_POST_TEXT,
          postedAt: "2026-06-24T14:26:00.000Z",
          sourceUrl: `https://truthsocial.com/@realDonaldTrump/${HOUSING_SAVE_POST_ID}`,
          archiveUrl: "https://www.trumpstruth.org/statuses/39514",
        },
      ],
      linkFn: vi.fn(async () => HOUSING_SAVE_LLM_RESULT),
    });

    expect(result.linked).toBe(1);
    expect(posts.get(HOUSING_SAVE_POST_ID)?.summary).toContain("SAVE");

    const saveLink = links.find(
      (l) => l.bill_type === "HR" && l.bill_number === 22
    );
    const housingLink = links.find(
      (l) => l.bill_type === "HR" && l.bill_number === 6644
    );

    expect(saveLink).toMatchObject({ role: "conditional", bill_number: 22 });
    expect(housingLink).toMatchObject({ role: "primary", bill_number: 6644 });
  });

  it("does not retry LLM linking after a failed attempt", async () => {
    const { db, posts } = createExecutiveMockDb();
    const env = {
      DB: db,
      CONGRESS: "119",
      SESSION: "2",
      CONGRESS_API_KEY: "test",
      OPENROUTER_API_KEY: "test",
    };
    const linkFn = vi.fn(async () => null);
    const status = {
      id: "retry-test-post",
      text: "Generic post with no bill references.",
      postedAt: "2026-06-24T14:26:00.000Z",
      sourceUrl: "https://truthsocial.com/@realDonaldTrump/retry-test-post",
      archiveUrl: "https://www.trumpstruth.org/statuses/retry-test",
    };

    await runExecutivePostsPipeline(env as any, { statuses: [status], linkFn });
    expect(linkFn).toHaveBeenCalledTimes(1);

    await runExecutivePostsPipeline(env as any, { statuses: [status], linkFn });
    expect(linkFn).toHaveBeenCalledTimes(1);
    expect(posts.get("retry-test-post")?.summary).toBeNull();
  });
});
