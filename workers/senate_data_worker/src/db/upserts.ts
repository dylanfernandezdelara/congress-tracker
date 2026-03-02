import { buildBillKey } from "../congress";
import type {
  ActivityIndexJson,
  MemberActivityJson,
  MemberIndexJson,
  VoteLedger,
} from "../types";

const CHUNK_SIZE = 100;

export interface UpsertStats {
  rowWrites: number;
}

interface MemberMetric {
  runId: string;
  metricDate: string;
  bioguideId: string;
  state: string;
  activityScore: number;
  defectionCount: number;
  sponsoredCount: number;
  cosponsoredCount: number;
  voteCount: number;
}

interface StateMetric {
  runId: string;
  metricDate: string;
  state: string;
  votesCount: number;
  defectionCount: number;
}

async function runChunked(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    await db.batch(statements.slice(i, i + CHUNK_SIZE));
  }
}

export async function upsertRunScopedData(
  db: D1Database,
  runId: string,
  membersIndex: MemberIndexJson,
  memberActivities: MemberActivityJson[],
  activityIndex: ActivityIndexJson | null,
  ledger: VoteLedger
): Promise<UpsertStats> {
  let rowWrites = 0;

  const memberStatements = membersIndex.members.map((member) =>
    db
      .prepare(
        `INSERT OR REPLACE INTO members_dim
        (run_id, bioguide_id, name, party, state, chamber)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .bind(runId, member.bioguide_id, member.name, member.party, member.state, member.chamber)
  );
  await runChunked(db, memberStatements);
  rowWrites += memberStatements.length;

  const billMap = new Map<string, any>();
  for (const memberActivity of memberActivities) {
    for (const activity of memberActivity.activities) {
      if (!("bill" in activity) || !activity.bill) continue;
      billMap.set(buildBillKey(activity.bill), activity.bill);
    }
  }
  for (const activity of activityIndex?.activities ?? []) {
    if (activity.bill) {
      billMap.set(buildBillKey(activity.bill), activity.bill);
    }
  }

  const billStatements = Array.from(billMap.entries()).map(([billKey, bill]) =>
    db
      .prepare(
        `INSERT OR REPLACE INTO bills_dim
        (run_id, bill_key, congress, bill_type, bill_number, title, policy_area, introduced_date,
         latest_action_date, summary_json, subjects_json, committees_json, impact_evidence_json, analysis_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
      )
      .bind(
        runId,
        billKey,
        bill.congress,
        bill.type,
        bill.number,
        bill.title ?? null,
        bill.policy_area ?? null,
        bill.introduced_date ?? null,
        bill.latest_action?.action_date ?? null,
        JSON.stringify({ summary: bill.summary ?? null }),
        JSON.stringify(bill.subjects ?? []),
        JSON.stringify(bill.committees ?? []),
        JSON.stringify(bill.impact_evidence ?? null),
        JSON.stringify(bill.analysis ?? null)
      )
  );
  await runChunked(db, billStatements);
  rowWrites += billStatements.length;

  const voteStatements: D1PreparedStatement[] = [];
  const voteMemberStatements: D1PreparedStatement[] = [];
  const memberMetricMap = new Map<string, MemberMetric>();
  const stateMetricMap = new Map<string, StateMetric>();

  for (const entry of ledger.entries) {
    const voteId = `${ledger.congress}-${ledger.session}-${entry.vote_number}`;
    voteStatements.push(
      db
        .prepare(
          `INSERT OR REPLACE INTO votes_fact
          (run_id, vote_id, congress, session, vote_number, vote_date, title, question, result,
           issue, issue_type, bill_key, yeas, nays, present_count, absent_count)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, NULL, NULL, NULL, NULL)`
        )
        .bind(
          runId,
          voteId,
          ledger.congress,
          ledger.session,
          entry.vote_number,
          entry.vote_date,
          entry.title,
          entry.question,
          entry.result,
          entry.issue ?? null,
          entry.issue ? "bill" : "other"
        )
    );

    for (const [bioguideId, voteCast] of Object.entries(entry.member_votes)) {
      const member = membersIndex.members.find((m) => m.bioguide_id === bioguideId);
      if (!member) continue;
      voteMemberStatements.push(
        db
          .prepare(
            `INSERT OR REPLACE INTO vote_member_fact
            (run_id, vote_id, bioguide_id, state, party, vote_cast, against_party_majority)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)`
          )
          .bind(runId, voteId, bioguideId, member.state, member.party, voteCast)
      );

      const memberKey = `${entry.vote_date}|${bioguideId}`;
      const metric = memberMetricMap.get(memberKey) ?? {
        runId,
        metricDate: entry.vote_date,
        bioguideId,
        state: member.state,
        activityScore: 0,
        defectionCount: 0,
        sponsoredCount: 0,
        cosponsoredCount: 0,
        voteCount: 0,
      };
      metric.voteCount += 1;
      metric.activityScore += 1;
      memberMetricMap.set(memberKey, metric);

      const stateKey = `${entry.vote_date}|${member.state}`;
      const stateMetric = stateMetricMap.get(stateKey) ?? {
        runId,
        metricDate: entry.vote_date,
        state: member.state,
        votesCount: 0,
        defectionCount: 0,
      };
      stateMetric.votesCount += 1;
      stateMetricMap.set(stateKey, stateMetric);
    }
  }

  await runChunked(db, voteStatements);
  await runChunked(db, voteMemberStatements);
  rowWrites += voteStatements.length + voteMemberStatements.length;

  const activityStatements: D1PreparedStatement[] = [];
  for (const memberActivity of memberActivities) {
    for (const activity of memberActivity.activities) {
      const activityDate = "date" in activity ? activity.date : memberActivity.generated_at.slice(0, 10);
      const activityId = `${memberActivity.member.bioguide_id}-${activity.type}-${activityDate}-${activityStatements.length}`;
      const billKey = "bill" in activity && activity.bill ? buildBillKey(activity.bill) : null;
      activityStatements.push(
        db
          .prepare(
            `INSERT OR REPLACE INTO member_activity_fact
            (run_id, activity_id, activity_date, bioguide_id, state, source, type, role, bill_key, is_recent, payload_json)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, 1, ?9)`
          )
          .bind(
            runId,
            activityId,
            activityDate,
            memberActivity.member.bioguide_id,
            memberActivity.member.state,
            activity.source,
            activity.type,
            billKey,
            JSON.stringify(activity)
          )
      );

      const memberKey = `${activityDate}|${memberActivity.member.bioguide_id}`;
      const metric = memberMetricMap.get(memberKey) ?? {
        runId,
        metricDate: activityDate,
        bioguideId: memberActivity.member.bioguide_id,
        state: memberActivity.member.state,
        activityScore: 0,
        defectionCount: 0,
        sponsoredCount: 0,
        cosponsoredCount: 0,
        voteCount: 0,
      };
      metric.activityScore += 2;
      if (activity.type === "roll_call_vote") metric.voteCount += 1;
      memberMetricMap.set(memberKey, metric);
    }
  }
  await runChunked(db, activityStatements);
  rowWrites += activityStatements.length;

  const memberMetricStatements = Array.from(memberMetricMap.values()).map((metric) =>
    db
      .prepare(
        `INSERT OR REPLACE INTO member_daily_metrics
        (run_id, metric_date, bioguide_id, state, activity_score, defection_count, sponsored_count, cosponsored_count, vote_count)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
      )
      .bind(
        metric.runId,
        metric.metricDate,
        metric.bioguideId,
        metric.state,
        metric.activityScore,
        metric.defectionCount,
        metric.sponsoredCount,
        metric.cosponsoredCount,
        metric.voteCount
      )
  );
  await runChunked(db, memberMetricStatements);
  rowWrites += memberMetricStatements.length;

  const stateMetricStatements = Array.from(stateMetricMap.values()).map((metric) =>
    db
      .prepare(
        `INSERT OR REPLACE INTO state_daily_metrics
        (run_id, metric_date, state, votes_count, defection_count)
        VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .bind(metric.runId, metric.metricDate, metric.state, metric.votesCount, metric.defectionCount)
  );
  await runChunked(db, stateMetricStatements);
  rowWrites += stateMetricStatements.length;

  return { rowWrites };
}
