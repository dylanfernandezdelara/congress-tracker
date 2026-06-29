import type { ExecutiveCatalogBill, ExecutiveLinkLlmResult } from "../../../../shared/executive-api-types";
import { formatBillDocket } from "../../../../shared/feed-content";

export function buildExecutiveLinkPrompt(params: {
  postText: string;
  postedAt: string;
  catalog: ExecutiveCatalogBill[];
  congress: number;
}): string {
  const catalogLines =
    params.catalog.length > 0
      ? params.catalog
          .map((bill) => {
            const label = formatBillDocket(bill.type, bill.number, bill.congress);
            return `- ${label} | title: ${bill.title ?? "N/A"} | headline: ${bill.headline ?? "N/A"} | policy: ${bill.policy_area ?? "N/A"}`;
          })
          .join("\n")
      : "(none indexed yet — still link any bill the post clearly references)";

  return `You analyze U.S. presidential Truth Social posts for impact on congressional legislation.

TASK: Read the post below and decide which bills from the ${params.congress}th Congress it affects — by explicit bill number, nickname, policy area, or conditional dependency (e.g. "won't sign X until Y passes").

The catalog below is a partial index of bills we already track. It is NOT a closed list. When the post clearly references a bill that is missing from the catalog, still output that bill's congress, type, and number.

POSTED AT: ${params.postedAt}
POST:
${params.postText}

TRACKED BILLS (reference only — link off-catalog bills when clearly referenced):
${catalogLines}

Return ONLY valid JSON:
{
  "linked_bills": [
    {
      "congress": ${params.congress},
      "type": "HR",
      "number": 6644,
      "role": "primary",
      "confidence": 0.95,
      "rationale": "One short sentence"
    }
  ],
  "banner_summary": "One neutral sentence for a breaking-news banner",
  "informal": true
}

Rules:
- congress must be ${params.congress} for every linked bill
- type is HR, S, HRES, SRES, HJRES, or SJRES (uppercase)
- role: primary | conditional | related | mentioned
- Use "conditional" when action on one bill depends on another passing
- SAVE America Act is H.R. 22 — NOT S. 2 (Secure America Act)
- At most one primary bill; confidence 0–1
- Link only bills clearly supported by the post text
- banner_summary must be neutral, factual, and under 140 characters`;
}
