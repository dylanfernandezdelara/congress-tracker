import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCrecSenateGranuleHighlights,
  fetchDailyDigest,
} from "./govinfo";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("govinfo adapters", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back from digest lookup to CREC package + granule summary", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/published/2026-02-10/2026-02-10") && url.includes("docClass=DIGEST")) {
        return jsonResponse({ packages: [] });
      }
      if (url.includes("/published/2026-02-10/2026-02-10") && !url.includes("docClass=DIGEST")) {
        return jsonResponse({
          packages: [{ packageId: "CREC-2026-02-10", title: "Congressional Record" }],
        });
      }
      if (url.includes("/packages/CREC-2026-02-10/summary")) {
        return jsonResponse({
          title: "Congressional Record Daily Digest",
          dateIssued: "2026-02-10",
          download: { pdfLink: "https://example.com/package.pdf" },
        });
      }
      if (url.includes("/packages/CREC-2026-02-10/granules") && !url.includes("/summary")) {
        return jsonResponse({
          granules: [
            {
              granuleId: "GRANULE-1",
              title: "Daily Digest/Senate Committee Meetings",
              granuleClass: "DAILYDIGEST",
            },
          ],
        });
      }
      if (url.includes("/packages/CREC-2026-02-10/granules/GRANULE-1/summary")) {
        return jsonResponse({
          title: "Daily Digest/Senate Committee Meetings",
          download: { txtLink: "https://example.com/senate-digest.txt" },
        });
      }
      return new Response("not found", { status: 404, statusText: "Not Found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchDailyDigest("2026-02-10", "test-key");

    expect(result.item).not.toBeNull();
    expect(result.item?.title).toBe("Congressional Record Daily Digest");
    expect(result.item?.senate_section_url).toBe("https://example.com/senate-digest.txt");
    expect(result.item?.date).toBe("2026-02-10");
  });

  it("extracts Senate CREC granule highlights with member metadata", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/published/2026-02-01/2026-02-10")) {
        return jsonResponse({
          packages: [{ packageId: "CREC-2026-02-10" }],
        });
      }
      if (url.includes("/packages/CREC-2026-02-10/granules") && !url.includes("/summary")) {
        return jsonResponse({
          granules: [
            { granuleId: "S1", granuleClass: "SENATE", title: "Senate Section" },
            { granuleId: "H1", granuleClass: "HOUSE", title: "House Section" },
          ],
        });
      }
      if (url.includes("/packages/CREC-2026-02-10/granules/S1/summary")) {
        return jsonResponse({
          title: "Senate Floor Proceedings",
          granuleClass: "SENATE",
          subGranuleClass: "PROCEEDING",
          dateIssued: "2026-02-10",
          members: [{ bioGuideId: "S000148", memberName: "Schumer, Charles E." }],
          committees: [{ committeeName: "Committee on Finance" }],
          download: {
            txtLink: "https://example.com/senate.txt",
            pdfLink: "https://example.com/senate.pdf",
          },
        });
      }
      return new Response("not found", { status: 404, statusText: "Not Found" });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCrecSenateGranuleHighlights(
      "2026-02-01",
      "2026-02-10",
      "test-key"
    );

    expect(result.error).toBeUndefined();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        source: "govinfo",
        granule_id: "S1",
        title: "Senate Floor Proceedings",
        member_bioguide_ids: ["S000148"],
        member_names: ["Schumer, Charles E."],
        committee_names: ["Committee on Finance"],
      })
    );
  });
});
