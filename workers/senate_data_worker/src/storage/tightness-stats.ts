import { isHouseOriginBillType } from "../../../../shared/bill-id";
import { voteCohesion, yeaShare } from "../../../../shared/vote-cohesion";
import type {
  SenateWaitingBill,
  TightnessDot,
  TightnessKind,
  TightnessStatsResponse,
} from "../../../../shared/stats-api-types";
import type { Env } from "../config";
import { FEED_MAX_BILLS } from "../constants";
import { ensureSchema } from "../d1/schema";
import type { FeedItem } from "../types";
import { buildFeedPage } from "./feed";
import { loadPassagePartySplits, rollIdentityKey } from "./passage-party-splits";
import { buildRecentConfirmations } from "./recent-confirmations";

export const TIGHTNESS_CONFIRMATION_LIMIT = 10;

function senateCommitteeName(item: FeedItem): string | null {
  const stages = item.process?.stages ?? [];
  for (let i = stages.length - 1; i >= 0; i -= 1) {
    const stage = stages[i];
    if (stage?.chamber === "Senate" && stage.committee_name) {
      return stage.committee_name;
    }
  }
  return null;
}

function housePassageDate(item: FeedItem): string | null {
  let latest: string | null = null;
  for (const vote of item.passage_votes) {
    if (vote.chamber !== "House") continue;
    if (!latest || vote.date > latest) latest = vote.date;
  }
  return latest;
}

function itemTextGrew(item: FeedItem): boolean {
  return (item.text_changes?.added_provisions.length ?? 0) > 0;
}

function toBillDot(args: {
  vote: FeedItem["passage_votes"][number];
  item: FeedItem;
  partySplits: TightnessDot["party_splits"];
  memberVotesAvailable: boolean;
}): TightnessDot {
  const { vote, item, partySplits, memberVotesAvailable } = args;
  return {
    kind: "bill",
    chamber: vote.chamber,
    congress: vote.congress,
    session: vote.session,
    roll_number: vote.roll_number,
    vote_date: vote.date,
    yeas: vote.yeas,
    nays: vote.nays,
    result: vote.result,
    yea_pct: yeaShare(vote.yeas, vote.nays),
    cohesion: voteCohesion(partySplits),
    party_splits: partySplits,
    member_votes_available: memberVotesAvailable,
    bill_type: item.bill.type,
    bill_number: item.bill.number,
    headline: item.digest?.headline ?? item.bill.title,
    nominee_name: null,
    position_title: null,
  };
}

export function senateWaitingFromFeed(items: FeedItem[]): SenateWaitingBill[] {
  const waiting: SenateWaitingBill[] = [];
  for (const item of items) {
    if (item.process?.current_status !== "in_second_chamber_committee") continue;
    if (!isHouseOriginBillType(item.bill.type)) continue;
    waiting.push({
      congress: item.bill.congress,
      bill_type: item.bill.type,
      bill_number: item.bill.number,
      headline: item.digest?.headline ?? null,
      title: item.bill.title,
      senate_committee: senateCommitteeName(item),
      current_label: item.process.current_label,
      house_passage_date: housePassageDate(item),
      text_grew: itemTextGrew(item),
    });
  }
  return waiting.sort((a, b) => {
    const aDate = a.house_passage_date ?? "";
    const bDate = b.house_passage_date ?? "";
    return bDate.localeCompare(aDate) || a.bill_number - b.bill_number;
  });
}

export async function buildTightnessStats(
  env: Env,
  congress: number,
  session: number,
  asOf: string = new Date().toISOString()
): Promise<TightnessStatsResponse> {
  await ensureSchema(env.DB);
  const [feed, confirmations] = await Promise.all([
    buildFeedPage(env, {
      limit: FEED_MAX_BILLS,
      offset: 0,
      includeIntros: false,
      // Splits are loaded below for the same rolls; the feed's own label would load them twice.
      skipCohesion: true,
    }),
    buildRecentConfirmations(env, congress, session, TIGHTNESS_CONFIRMATION_LIMIT, asOf),
  ]);

  const passageRolls: Array<{
    chamber: string;
    congress: number;
    session: number;
    roll_number: number;
  }> = [];
  for (const item of feed.items) {
    for (const vote of item.passage_votes) {
      passageRolls.push({
        chamber: vote.chamber,
        congress: vote.congress,
        session: vote.session,
        roll_number: vote.roll_number,
      });
    }
  }
  const passageSplits = await loadPassagePartySplits(env.DB, passageRolls);

  const house_passage: TightnessDot[] = [];
  const senateBills: TightnessDot[] = [];
  for (const item of feed.items) {
    for (const vote of item.passage_votes) {
      const key = rollIdentityKey(vote.chamber, vote.congress, vote.session, vote.roll_number);
      const insight = passageSplits.get(key) ?? { splits: [], available: false };
      const dot = toBillDot({
        vote,
        item,
        partySplits: insight.splits,
        memberVotesAvailable: insight.available,
      });
      if (vote.chamber === "House") house_passage.push(dot);
      else senateBills.push(dot);
    }
  }

  const senateNominees: TightnessDot[] = confirmations.confirmations.map((item) => ({
    kind: "nominee" as TightnessKind,
    chamber: item.chamber,
    congress: item.congress,
    session: item.session,
    roll_number: item.roll_number,
    vote_date: item.vote_date,
    yeas: item.yeas,
    nays: item.nays,
    result: item.result,
    yea_pct: yeaShare(item.yeas, item.nays),
    cohesion: voteCohesion(item.party_splits),
    party_splits: item.party_splits,
    member_votes_available: item.party_splits.length > 0,
    bill_type: null,
    bill_number: null,
    headline: item.headline,
    nominee_name: item.nominee_names[0]?.display_name ?? item.headline,
    position_title: item.position_title,
  }));

  return {
    congress,
    session,
    house_passage,
    senate: [...senateBills, ...senateNominees],
    senate_waiting: senateWaitingFromFeed(feed.items),
    as_of: asOf,
  };
}
