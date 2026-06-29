import type { ParsedTrumpTruthStatus } from "../sources/trumpstruth";
import type { Env } from "../config";
import { congressNumber } from "../config";
import { EXECUTIVE_POSTS_FETCH_LIMIT } from "../constants";
import {
  getExecutivePost,
  replaceExecutivePostBills,
  upsertExecutivePost,
} from "../d1/executive";
import { getDigest } from "../d1/digests";
import {
  recordExecutivePostsPipelineFailure,
  recordExecutivePostsPipelineSuccess,
} from "../d1/pipeline-state";
import type { FeedPipelineTrigger } from "../../../../shared/ingest-api-types";
import {
  buildExecutiveCandidateCatalog,
  ensureBillInCatalog,
} from "../executive/build-catalog";
import {
  applyExecutiveLinkGuardrails,
  buildExplicitRefExecutiveLink,
} from "../executive/guardrails";
import { hydrateBillFromCongress } from "../executive/hydrate-bill";
import { fetchTrumpTruthRecentStatuses } from "../sources/trumpstruth";
import { linkExecutivePostWithLlm } from "../synthesis/executive-link";
import type {
  ExecutiveBillLink,
  ExecutiveBillRole,
  ExecutiveCatalogBill,
  ExecutiveLinkLlmResult,
} from "../../../../shared/executive-api-types";
import type { BillRef } from "../types";

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
    catalog: ExecutiveCatalogBill[];
  }
) => Promise<ExecutiveLinkLlmResult | null>;

interface StoredExecutiveRaw extends ParsedTrumpTruthStatus {
  linkAttemptedAt?: string;
}

function readLinkAttemptedAt(rawJson: string | null): string | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson) as StoredExecutiveRaw;
    return parsed.linkAttemptedAt ?? null;
  } catch {
    return null;
  }
}

function buildExecutiveRawJson(
  status: ParsedTrumpTruthStatus,
  linkAttemptedAt?: string
): string {
  if (linkAttemptedAt) {
    return JSON.stringify({ ...status, linkAttemptedAt });
  }
  return JSON.stringify(status);
}

function shouldSkipExecutiveStatus(existing: Awaited<ReturnType<typeof getExecutivePost>>): boolean {
  if (!existing) return false;
  if (existing.summary) return true;
  return readLinkAttemptedAt(existing.raw_json) !== null;
}

async function verifyExecutiveBillLink(
  env: Env,
  link: ExecutiveBillLink
): Promise<{ verified: boolean; hydrated: boolean }> {
  const bill: BillRef = {
    congress: link.congress,
    type: link.type,
    number: link.number,
  };
  const existing = await getDigest(env.DB, bill.congress, bill.type, bill.number);
  if (existing?.title) return { verified: true, hydrated: false };

  try {
    const ok = await hydrateBillFromCongress(env, bill);
    return { verified: ok, hydrated: ok };
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "executive_bill_hydration_failed",
        bill,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return { verified: false, hydrated: false };
  }
}

async function processExecutiveStatus(
  env: Env,
  status: ParsedTrumpTruthStatus,
  catalog: ExecutiveCatalogBill[],
  linkFn: ExecutiveLinkFn
): Promise<{ ingested: boolean; linked: boolean; hydrated: number }> {
  const existing = await getExecutivePost(env.DB, status.id);
  if (shouldSkipExecutiveStatus(existing)) {
    return { ingested: false, linked: false, hydrated: 0 };
  }

  const congress = congressNumber(env);
  const llmResult = await linkFn(env, {
    postText: status.text,
    postedAt: status.postedAt,
    catalog,
  });
  const guarded =
    (llmResult ? applyExecutiveLinkGuardrails(status.text, llmResult, catalog, congress) : null) ??
    buildExplicitRefExecutiveLink(status.text, congress);

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
      rawJson: buildExecutiveRawJson(status, new Date().toISOString()),
    });
    return { ingested: true, linked: false, hydrated: 0 };
  }

  let hydrated = 0;
  const verifiedLinks: ExecutiveBillLink[] = [];
  let workingCatalog = catalog;

  for (const link of guarded.linked_bills) {
    const result = await verifyExecutiveBillLink(env, link);
    if (!result.verified) continue;
    verifiedLinks.push(link);
    if (result.hydrated) hydrated += 1;
    workingCatalog = await ensureBillInCatalog(env, link, workingCatalog);
  }

  if (verifiedLinks.length === 0) {
    await upsertExecutivePost(env.DB, {
      id: status.id,
      platform: "truth_social",
      author: "realDonaldTrump",
      text: status.text,
      postedAt: status.postedAt,
      sourceUrl: status.sourceUrl,
      archiveUrl: status.archiveUrl,
      summary: null,
      rawJson: buildExecutiveRawJson(status, new Date().toISOString()),
    });
    return { ingested: true, linked: false, hydrated };
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
    rawJson: buildExecutiveRawJson(status),
  });

  await replaceExecutivePostBills(
    env.DB,
    status.id,
    verifiedLinks.map((link) => ({
      billCongress: link.congress,
      billType: link.type,
      billNumber: link.number,
      linkMethod: llmResult ? "llm" : "explicit_ref",
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
    trigger?: FeedPipelineTrigger;
  } = {}
): Promise<RunExecutivePostsResult> {
  const trigger = options.trigger ?? "admin";
  const linkFn = options.linkFn ?? linkExecutivePostWithLlm;
  const limit = options.limit ?? EXECUTIVE_POSTS_FETCH_LIMIT;

  try {
    const statuses =
      options.statuses ??
      (await fetchTrumpTruthRecentStatuses(limit, options.fetchImpl ?? fetch));
    let catalog = await buildExecutiveCandidateCatalog(env);

    let ingested = 0;
    let linked = 0;
    let hydrated = 0;
    let skipped = 0;

    for (const status of statuses) {
      const result = await processExecutiveStatus(env, status, catalog, linkFn);
      if (result.ingested) ingested += 1;
      else skipped += 1;
      if (result.linked) linked += 1;
      if (result.hydrated > 0) {
        hydrated += result.hydrated;
        catalog = await buildExecutiveCandidateCatalog(env);
      }
    }

    const pipelineResult = {
      fetched: statuses.length,
      ingested,
      linked,
      hydrated,
      skipped,
    };

    await recordExecutivePostsPipelineSuccess(env.DB, trigger, pipelineResult);
    return pipelineResult;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await recordExecutivePostsPipelineFailure(env.DB, trigger, message);
    throw err;
  }
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
