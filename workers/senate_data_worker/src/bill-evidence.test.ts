import { afterEach, describe, expect, it, vi } from "vitest";
import { harvestBillEvidence } from "./bill-evidence";
import type { BillRef } from "./types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("harvestBillEvidence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses fallback aliases when primary endpoint path fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/relatedbills?")) {
        return new Response("not found", { status: 404, statusText: "Not Found" });
      }
      if (url.includes("/related-bills?")) {
        return jsonResponse({ relatedBills: [] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const bill: BillRef = {
      congress: 119,
      type: "S",
      number: "210",
      title: "Transit Modernization Act",
    };

    const harvested = await harvestBillEvidence(bill, "test-key");
    const relatedStatus = harvested.evidence.endpoints.related_bills;
    expect(relatedStatus?.ok).toBe(true);
    expect(relatedStatus?.fallback_used).toBe(true);
    expect(relatedStatus?.attempted_urls?.length).toBeGreaterThanOrEqual(2);
  });

  it("does not treat optional endpoint 404s as a harvest error", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/cbo-cost-estimates?") || url.includes("/committee-reports?")) {
        return new Response("not found", { status: 404, statusText: "Not Found" });
      }
      if (url.includes("/cbocostestimates?") || url.includes("/committeereports?")) {
        return new Response("not found", { status: 404, statusText: "Not Found" });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const bill: BillRef = {
      congress: 119,
      type: "HR",
      number: "7147",
      title: "Housing for the 21st Century Act",
    };

    const harvested = await harvestBillEvidence(bill, "test-key");
    expect(harvested.error).toBeUndefined();
    expect(harvested.evidence.source_availability.cbo_cost_estimates).toBe(false);
    expect(harvested.evidence.source_availability.committee_reports).toBe(false);
    expect(harvested.evidence.endpoints.cbo_cost_estimates?.ok).toBe(false);
    expect(harvested.evidence.endpoints.committee_reports?.ok).toBe(false);
  });

  it("still surfaces a harvest error when a core endpoint returns 404", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/bill/119/hr/7147?")) {
        return new Response("not found", { status: 404, statusText: "Not Found" });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const bill: BillRef = {
      congress: 119,
      type: "HR",
      number: "7147",
      title: "Housing for the 21st Century Act",
    };

    const harvested = await harvestBillEvidence(bill, "test-key");
    expect(harvested.error).toBe("HTTP 404: Not Found");
    expect(harvested.evidence.endpoints.detail?.ok).toBe(false);
  });
});
