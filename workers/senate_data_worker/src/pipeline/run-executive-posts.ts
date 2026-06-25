import type { ParsedTrumpTruthStatus } from "../sources/trumpstruth";
import type { Env } from "../config";
import { EXECUTIVE_POSTS_FETCH_LIMIT } from "../constants";
import {
  getExecutivePost,
  replaceExecutivePostBills,
  upsertExecutivePost,
} from "../d1/executive";
import { buildExecutiveCandidateCatalog, ensureBillInCatalog } from "../executive/build-catalog";
import { applyExecutiveLinkGuardrails } from "../executive/guardrails";
import { hydrateBillFromCongress } from "../executive/hydrate-bill";
import { fetchTrumpTruthRecentStatuses } from "../sources/trumpstruth";
import { linkExecutivePostWithLlm } from "../synthesis/executive-link";
import type { ExecutiveBillRole, ExecutiveLinkLlmResult } from "../../../../shared/executive-api-types";

export interface RunExecutivePostsResult {
  fetched: number;
  ingested: number;
  linked: number;
  hydrated: number;
  skipped: number;
}

export type ExecutiveLinkFn = (
  env: Env,
  params: {
    postText: string;
    postedAt: string;
    catalog: Awaited<ReturnType<typeof buildExecutiveCandidateCatalog>>;
  }
) => Promise<ExecutiveLinkLlmResult | null>;

async function processExecutiveStatus(
  env: Env,
  status: ParsedTrumpTruthStatus,
  linkFn: ExecutiveLinkFn
): Promise<{ ingested: boolean; linked: boolean; hydrated: number }> {
  const existing = await getExecutivePost(env.DB, status.id);
  if (existing?.summary) {
    return { ingested: false, linked: false, hydrated: 0 };
  }

  let catalog = await buildExecutiveCandidateCatalog(env);
  const llmResult = await linkFn(env, {
    postText: status.text,
    postedAt: status.postedAt,
    catalog,
  });
  const guarded = llmResult ? applyExecutiveLinkGuardrails(status.text, llmResult, catalog) : null;
  if (!guarded) {
    await upsertExecutivePost(env.DB, {
      id: status.id,
      platform: "truth_social",
      author: "realDonaldTrump",
      text: status.text,
      postedAt: status.postedAt,
      sourceUrl: status.sourceUrl,
      archiveUrl: status.archiveUrl,
      summary: null,
      rawJson: JSON.stringify(status),
    });
    return { ingested: true, linked: false, hydrated: 0 };
  }

  let hydrated = 0;
  for (const link of guarded.linked_bills) {
    const bill = { congress: link.congress, type: link.type, number: link.number };
    const ok = await hydrateBillFromCongress(env, bill);
    if (ok) hydrated += 1;
    catalog = await ensureBillInCatalog(env, bill, catalog);
  }

  await upsertExecutivePost(env.DB, {
    id: status.id,
    platform: "truth_social",
    author: "realDonaldTrump",
    text: status.text,
    postedAt: status.postedAt,
    sourceUrl: status.sourceUrl,
    archiveUrl: status.archiveUrl,
    summary: guarded.banner_summary,
    rawJson: JSON.stringify(status),
  });

  await replaceExecutivePostBills(
    env.DB,
    status.id,
    guarded.linked_bills.map((link) => ({
      billCongress: link.congress,
      billType: link.type,
      billNumber: link.number,
      linkMethod: "llm",
      role: link.role as ExecutiveBillRole,
      confidence: link.confidence,
      rationale: link.rationale ?? null,
      isPrimary: link.role === "primary",
    }))
  );

  return { ingested: true, linked: true, hydrated };
}

export async function runExecutivePostsPipeline(
  env: Env,
  options: {
    fetchImpl?: typeof fetch;
    linkFn?: ExecutiveLinkFn;
    statuses?: ParsedTrumpTruthStatus[];
    limit?: number;
  } = {}
): Promise<RunExecutivePostsResult> {
  const linkFn = options.linkFn ?? linkExecutivePostWithLlm;
  const limit = options.limit ?? EXECUTIVE_POSTS_FETCH_LIMIT;
  const statuses =
    options.statuses ??
    (await fetchTrumpTruthRecentStatuses(limit, options.fetchImpl ?? fetch));

  let ingested = 0;
  let linked = 0;
  let hydrated = 0;
  let skipped = 0;

  for (const status of statuses) {
    const result = await processExecutiveStatus(env, status, linkFn);
    if (result.ingested) ingested += 1;
    else skipped += 1;
    if (result.linked) linked += 1;
    hydrated += result.hydrated;
  }

  return {
    fetched: statuses.length,
    ingested,
    linked,
    hydrated,
    skipped,
  };
}

export async function ingestExecutivePostManual(
  env: Env,
  status: ParsedTrumpTruthStatus,
  linkFn?: ExecutiveLinkFn
): Promise<RunExecutivePostsResult> {
  return runExecutivePostsPipeline(env, {
    statuses: [status],
    linkFn: linkFn ?? linkExecutivePostWithLlm,
  });
}
