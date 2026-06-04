/**
 * Congress.gov Daily Congressional Record Senate articles adapter.
 */

import { fetchJsonWithRetry, type FetchConfig } from "../fetch";
import { mapWithConcurrency } from "../concurrency";
import { buildCongressUrl } from "../sources/congress-client";
import { getString, normalizeDate, type CongressPagination } from "./internal";

interface CongressDailyRecordIssue {
  volumeNumber?: number;
  issueNumber?: string | number;
  issueDate?: string;
}

interface CongressDailyRecordListResponse {
  dailyCongressionalRecord?: CongressDailyRecordIssue[];
  pagination?: CongressPagination;
}

interface CongressDailyRecordSectionArticle {
  title?: string;
  startPage?: string;
  endPage?: string;
  text?: Array<{ type?: string; url?: string }>;
}

interface CongressDailyRecordSection {
  name?: string;
  sectionArticles?: CongressDailyRecordSectionArticle[];
}

interface CongressDailyRecordArticlesResponse {
  articles?: CongressDailyRecordSection[];
}

interface SenateDailyRecordAdapterOptions {
  issueLimit?: number;
  maxArticles?: number;
}

export interface SenateDailyRecordArticleItem {
  source: "congress";
  issue_date: string;
  volume_number: number;
  issue_number: string;
  section_name: string;
  title: string;
  start_page?: string;
  end_page?: string;
  formatted_text_url?: string;
  pdf_url?: string;
}
export async function fetchDailyCongressionalRecordSenateArticles(
  apiKey: string,
  config: FetchConfig = {},
  options: SenateDailyRecordAdapterOptions = {}
): Promise<{ articles: SenateDailyRecordArticleItem[]; error?: string }> {
  const issueLimit = Math.max(1, Math.min(options.issueLimit ?? 20, 100));
  const maxArticles = Math.max(1, options.maxArticles ?? 100);
  const listUrl = buildCongressUrl(
    "/daily-congressional-record",
    {
      limit: issueLimit,
      offset: 0,
    },
    apiKey
  );
  const issueListResult = await fetchJsonWithRetry<CongressDailyRecordListResponse>(
    listUrl,
    config
  );
  if (!issueListResult.success || !issueListResult.data) {
    return {
      articles: [],
      error:
        issueListResult.error ??
        "Congress daily congressional record list lookup failed",
    };
  }

  const issues = issueListResult.data.dailyCongressionalRecord ?? [];
  const issueWorklist = issues
    .map((issue) => {
      const volumeNumber = issue.volumeNumber;
      const issueNumber = getString(issue.issueNumber);
      const issueDate = normalizeDate(issue.issueDate) ?? undefined;
      if (!volumeNumber || !issueNumber || !issueDate) return null;
      return {
        volumeNumber,
        issueNumber,
        issueDate,
      };
    })
    .filter(
      (
        issue
      ): issue is { volumeNumber: number; issueNumber: string; issueDate: string } =>
        Boolean(issue)
    );

  const articleResults = await mapWithConcurrency(
    issueWorklist,
    Math.max(1, Math.min(config.concurrency ?? 4, 4)),
    async (issue) => {
      const articlesUrl = buildCongressUrl(
        `/daily-congressional-record/${issue.volumeNumber}/${issue.issueNumber}/articles`,
        {
          limit: 250,
          offset: 0,
        },
        apiKey
      );
      const articlesResult = await fetchJsonWithRetry<CongressDailyRecordArticlesResponse>(
        articlesUrl,
        config
      );
      if (!articlesResult.success || !articlesResult.data) {
        return [] as SenateDailyRecordArticleItem[];
      }

      const sections = articlesResult.data.articles ?? [];
      const senateSections = sections.filter((section) =>
        (section.name ?? "").toLowerCase().includes("senate")
      );
      if (senateSections.length === 0) {
        return [];
      }

      const extracted: SenateDailyRecordArticleItem[] = [];
      for (const section of senateSections) {
        const sectionName = section.name?.trim() ?? "Senate";
        for (const sectionArticle of section.sectionArticles ?? []) {
          const title = sectionArticle.title?.trim();
          if (!title) continue;
          const textEntries = sectionArticle.text ?? [];
          const formattedTextUrl =
            textEntries.find((entry) =>
              (entry.type ?? "").toLowerCase().includes("formatted")
            )?.url ??
            textEntries.find((entry) =>
              (entry.type ?? "").toLowerCase().includes("text")
            )?.url;
          const pdfUrl =
            textEntries.find((entry) =>
              (entry.type ?? "").toLowerCase().includes("pdf")
            )?.url;

          extracted.push({
            source: "congress",
            issue_date: issue.issueDate,
            volume_number: issue.volumeNumber,
            issue_number: issue.issueNumber,
            section_name: sectionName,
            title,
            start_page: sectionArticle.startPage?.trim() || undefined,
            end_page: sectionArticle.endPage?.trim() || undefined,
            formatted_text_url: formattedTextUrl,
            pdf_url: pdfUrl,
          });
        }
      }
      return extracted;
    }
  );

  const flattened = articleResults.flatMap((items) => items);
  flattened.sort((a, b) => {
    const byDate = b.issue_date.localeCompare(a.issue_date);
    if (byDate !== 0) return byDate;
    const byVolume = b.volume_number - a.volume_number;
    if (byVolume !== 0) return byVolume;
    return a.title.localeCompare(b.title);
  });
  return {
    articles: flattened.slice(0, maxArticles),
  };
}
