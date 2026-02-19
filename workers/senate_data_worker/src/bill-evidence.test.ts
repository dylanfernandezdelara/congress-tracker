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
});

