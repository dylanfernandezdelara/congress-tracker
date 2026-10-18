# Launch list

The single list of what ships before trackcongress.org is announced. Every session reads this first and updates it when an item lands (strike it through with the PR number). Plan docs elsewhere in `docs/` are background, not the list.

Started 2026-10-17.

## What the site is for

1. **Bills in plain English.** What a bill actually does, without the jargon.
2. **What your members of Congress are doing.** How they vote and what they sponsor.
3. **Sharing.** A bill (or a member) you can send to a friend, with a link that previews well and still works next month.

Mobile is where most people will open a shared link, so it is the default surface, not a port.

Out of scope until after launch: anything that needs users to exist (feedback, comments, accounts), dfdl-ui polish that trackcongress doesn't need, and the executive signals plan.

## Must ship

### Plain English

- [ ] **Show `terms_explained`.** The writer already produces a glossary of legal labels per bill; the UI drops it. Render it under "What it does" in `FeedSummarySections.tsx`.
- [ ] **Bill links work for any bill, not just the 45-day feed.** Today `/?bill=` says "no longer in the recent feed" once a bill ages out. Load the bill by id when it isn't in the feed (worker endpoint + Home handling). Needed for sharing too.
- [ ] **Coverage decision (Dylan).** Every bill reachable on the site has a summary. The whole-Congress backfill (`scope=congress`, ~$20, key cap $15) only matters once old bills are linkable (item above). Decide after that lands.

### Your members

- [ ] **Find your members.** An entry point in the header and at the top of the mobile feed: pick a state → its two senators and House members, each opening the profile. The state is pre-filled from the visitor's IP (Cloudflare `request.cf.regionCode`, no permission prompt) and shown as "Showing Pennsylvania · Change"; the choice is remembered. Outside the US or unknown → the national view. Zip/address → district is a later step (needs a zip-to-district dataset); state first.
- [ ] **Member profile has its own URL** (`/?member=<bioguide>`), so it can be opened from a link, shared and bookmarked.
- [ ] **Profile shows all sponsored bills,** not the first 5 (paginate or "show all").

### Sharing

- [ ] **Member share button + OG card,** same pattern as bills (`og-card`, `bill-og.ts`).
- [ ] **Shared bill link check on real apps:** iMessage, WhatsApp, X, Slack previews show the per-bill card, and the link opens straight to the bill on a phone.

### Mobile

- [ ] **Member spotlights and federal control move up** from the very bottom of the feed (`home-mobile-rails`), or fold into the "Find your members" entry.
- [ ] **No hover-only information.** ~11 `title=` tooltips (BillIdChip, truncated titles in MemberProfile/ProfileBillRow, LeftSidebar icons) are unreachable on touch; show the text or make it tappable.
- [ ] **Real-phone pass** at 320 and 390px through the full flow: open a shared link → read the bill → open the sponsor → find your members. Fix what's cramped; check tightness-dot tap targets.

### 2026 midterms (election day Tuesday 2026-11-03)

Added 2026-10-17; this is the launch feature. Mail ballots are already out, so it ships within the week. Rules and data format: `docs/MIDTERMS_2026.md`.

- [ ] **Data:** every House race, Senate race and governor race for all 50 states and DC, hand-compiled with sources (`shared/elections-2026/states/`).
- [ ] **Guide UI:** pick a state (pre-filled from IP) → its races, competitive ones first and flagged by the cited Crystal Ball rating; every candidate shown the same way; incumbents link to their record.
- [ ] **Official ballot links** per state: election office and find-your-district / sample-ballot lookup.

### Cleanup

- [ ] **Remove summary feedback** ("Was this clear? Yes / No"): `SummaryFeedback.tsx`, `/feedback/summary`, its logging and tests. Keep the `digest_feedback` table (no migration needed before launch). Decided 2026-10-17: no users yet.

## After launch

- Zip/address → district lookup.
- Full vote history per member; attendance / missed votes; procedural and amendment votes (ingest only fetches passage and confirmation roll calls today).
- Discussion or reactions on bills.
- Prompt v3.5 (evidence list in `SUMMARIES_NEXT_STEPS.md`), enforcing the grade-level check.
- Executive signals (`EXECUTIVE_SIGNALS_PLAN.md`).
- Disclosures/portfolios with real data (seed-only today).
