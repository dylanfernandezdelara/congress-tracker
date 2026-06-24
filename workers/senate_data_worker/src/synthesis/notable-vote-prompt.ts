import { formatBillDocket } from "../../../../shared/feed-content";
import { partyDisplayName } from "../../../../shared/party";

export interface NotableVotePromptContext {
  billType: string;
  billNumber: number;
  congress: number;
  chamber: string;
  voteDate: string;
  result: string;
  yeas: number;
  nays: number;
  margin: number;
  headline: string | null;
  billTitle: string | null;
  digestLead: string | null;
  rawSummary: string | null;
  crossPartyBreaks: number;
  bipartisanYeas: boolean;
  minorityHelpedPass: boolean;
  chamberMajorityParty: string | null;
  isProcedural: boolean;
}

export function buildNotableVotePrompt(ctx: NotableVotePromptContext): string {
  const billLabel = formatBillDocket(ctx.billType, ctx.billNumber, ctx.congress);
  const majorityLabel = ctx.chamberMajorityParty
    ? partyDisplayName(ctx.chamberMajorityParty)
    : "unknown";

  return `You explain why a U.S. congressional passage roll call matters to politically curious readers.

BILL: ${billLabel}
TITLE: ${ctx.billTitle ?? "N/A"}
DIGEST HEADLINE: ${ctx.headline ?? "N/A"}
PLAIN SUMMARY: ${ctx.digestLead ?? ctx.rawSummary?.slice(0, 600) ?? "N/A"}

VOTE CONTEXT:
- Chamber: ${ctx.chamber}
- Date: ${ctx.voteDate}
- Result: ${ctx.result} (${ctx.yeas}-${ctx.nays}, margin ${ctx.margin})
- Party-line breaks: ${ctx.crossPartyBreaks} members voted against their party majority
- Bipartisan yeas: ${ctx.bipartisanYeas ? "yes" : "no"}
- Minority party supplied decisive support: ${ctx.minorityHelpedPass ? "yes" : "no"}
- Chamber majority party: ${majorityLabel}
- Procedural resolution: ${ctx.isProcedural ? "likely yes" : "no"}

Return ONLY valid JSON:
{
  "why_it_matters": "1-2 sentences. Lead with substantive policy stakes when known, then political significance (close margin, party splits, coalition dynamics). Max 45 words."
}

Rules:
- Use only facts from the context above. Do not invent policy details.
- If this is purely procedural floor business with no policy stakes, say so in plain language.
- Never open with the bill docket alone — explain what happened and why readers should care.
- Keep a neutral, concise tone.`;
}
