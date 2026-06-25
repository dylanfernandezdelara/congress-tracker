import type { ExecutiveCatalogBill } from "../../../../shared/executive-api-types";
import { formatBillDocket } from "../../../../shared/feed-content";

export function buildExecutiveLinkPrompt(params: {
  postText: string;
  postedAt: string;
  catalog: ExecutiveCatalogBill[];
}): string {
  const catalogLines = params.catalog
    .map((bill) => {
      const label = formatBillDocket(bill.type, bill.number, bill.congress);
      return `- ${label} | title: ${bill.title ?? "N/A"} | headline: ${bill.headline ?? "N/A"} | policy: ${bill.policy_area ?? "N/A"}`;
    })
    .join("\n");

  return `You link a U.S. President Truth Social post to congressional bills.

POSTED AT: ${params.postedAt}
POST:
${params.postText}

CANDIDATE BILLS (prefer these when post uses nicknames or shorthand):
${catalogLines}

You may also link any other bill from the ${params.catalog[0]?.congress ?? 119}th Congress when the post clearly references it by title, nickname, or bill number, even if it is not listed above.

Return ONLY valid JSON:
{
  "linked_bills": [
    {
      "congress": 119,
      "type": "HR",
      "number": 6644,
      "role": "primary",
      "confidence": 0.95,
      "rationale": "One short sentence"
    }
  ],
  "banner_summary": "One sentence for a breaking-news banner",
  "informal": true
}

Rules:
- role must be one of: primary, conditional, related, mentioned
- Use "conditional" when signing/action on one bill depends on another bill passing
- SAVE America Act is H.R. 22 — NOT S. 2 Secure America Act
- At most one primary bill
- confidence is 0-1
- Only link bills clearly referenced in the post
- banner_summary must be neutral and factual`;
}
