import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDailyCongressionalRecordSenateArticles,
  fetchSenateCommitteeMeetings,
} from "./congress";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("congress adapter expansion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses committee meeting details with bill refs and nomination signals", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/committee-meeting/119/senate?")) {
        return jsonResponse({
          committeeMeetings: [{ eventId: 123, updateDate: "2026-02-19" }],
        });
      }
      if (url.includes("/committee-meeting/119/senate/123?")) {
        return jsonResponse({
          committeeMeeting: {
            date: "2026-02-20T15:00:00-05:00",
            title: "Hearing on S. 455 and nomination of Jane Doe",
            committees: [{ name: "Committee on Judiciary", systemCode: "ssju00" }],
            meetingDocuments: [
              {
                documentType: "Text",
                description: "Discussion of H.R. 12 and nominations",
              },
            ],
            videos: [{ url: "https://example.com/meeting/123" }],
          },
        });
      }
      return new Response("not found", { status: 404, statusText: "Not Found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchSenateCommitteeMeetings(119, "test-key");

    expect(result.meetings).toHaveLength(1);
    expect(result.meetings[0].title).toContain("S. 455");
    expect(result.meetings[0].related_bills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ congress: 119, type: "S", number: "455" }),
        expect.objectContaining({ congress: 119, type: "HR", number: "12" }),
      ])
    );
    expect(result.meetings[0].nomination_signals.length).toBeGreaterThan(0);
  });

  it("extracts senate section articles from daily congressional record", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/daily-congressional-record?")) {
        return jsonResponse({
          dailyCongressionalRecord: [
            {
              volumeNumber: 170,
              issueNumber: 42,
              issueDate: "2026-02-10",
            },
          ],
        });
      }
      if (url.includes("/daily-congressional-record/170/42/articles?")) {
        return jsonResponse({
          articles: [
            {
              name: "Senate Section",
              sectionArticles: [
                {
                  title: "Nominations Received",
                  startPage: "S1001",
                  endPage: "S1003",
                  text: [
                    { type: "Formatted Text", url: "https://example.com/formatted" },
                    { type: "PDF", url: "https://example.com/article.pdf" },
                  ],
                },
              ],
            },
          ],
        });
      }
      return new Response("not found", { status: 404, statusText: "Not Found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDailyCongressionalRecordSenateArticles("test-key");

    expect(result.error).toBeUndefined();
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]).toEqual(
      expect.objectContaining({
        source: "congress",
        issue_date: "2026-02-10",
        title: "Nominations Received",
        formatted_text_url: "https://example.com/formatted",
        pdf_url: "https://example.com/article.pdf",
      })
    );
  });
});
