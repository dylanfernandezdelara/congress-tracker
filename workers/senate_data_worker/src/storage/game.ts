import { GAME_DEFAULT_LIMIT, GAME_MAX_LIMIT, GAME_POOL_SIZE, VOTE_LOOKBACK_DAYS } from "../constants";
import { parseStoredDigest } from "../d1/digests";
import {
  getGameVoteByKey,
  getPartySplitForRoll,
  selectGameVoteCandidates,
  type GameVoteCandidateRow,
} from "../d1/game-votes";
import { ensureSchema } from "../d1/schema";
import { lookbackStartIso } from "../sources/congress-client";
import { voteKey, parseVoteKey } from "../vote-key";
import type {
  GamePartySplit,
  GameRevealResponse,
  GameRoundsResponse,
} from "../../../../shared/game-api-types";
import {
  buildGamePrompt,
  getGameCorrectAnswer,
  shuffleInPlace,
  type GamePromptInput,
} from "../../../../shared/feed-content";

export interface GameRoundsOptions {
  limit: number;
}

function candidateToRound(row: GameVoteCandidateRow): { id: string; prompt: { headline: string; snippet: string } } | null {
  const digest = parseStoredDigest(row.digest_json);
  const prompt = buildGamePrompt({
    title: row.title,
    question: row.question,
    digest,
    rawSummaryText: row.raw_summary_text,
  });
  if (!prompt) return null;
  if (getGameCorrectAnswer(row.result) === null) return null;

  return {
    id: voteKey({
      chamber: row.chamber as "House" | "Senate",
      congress: row.congress,
      session: row.session,
      rollNumber: row.roll_number,
    }),
    prompt,
  };
}

export async function buildGameRounds(
  db: D1Database,
  options: GameRoundsOptions
): Promise<GameRoundsResponse> {
  await ensureSchema(db);
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const candidates = await selectGameVoteCandidates(db, lookback, GAME_POOL_SIZE);

  const rounds = candidates
    .map(candidateToRound)
    .filter((round): round is NonNullable<typeof round> => round !== null);

  shuffleInPlace(rounds);

  const limit = Math.min(options.limit, GAME_MAX_LIMIT);
  return {
    rounds: rounds.slice(0, limit),
    total: rounds.length,
    limit,
  };
}

function rowToRevealInput(row: GameVoteCandidateRow): GamePromptInput {
  return {
    title: row.title,
    question: row.question,
    digest: parseStoredDigest(row.digest_json),
    rawSummaryText: row.raw_summary_text,
  };
}

function isEligibleGameRow(row: GameVoteCandidateRow): boolean {
  return buildGamePrompt(rowToRevealInput(row)) !== null && getGameCorrectAnswer(row.result) !== null;
}

export async function buildGameReveal(db: D1Database, roundId: string): Promise<GameRevealResponse | null> {
  await ensureSchema(db);
  const parsed = parseVoteKey(roundId);
  if (!parsed) return null;

  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const row = await getGameVoteByKey(db, parsed, lookback);
  if (!row || !isEligibleGameRow(row)) return null;

  const correct = getGameCorrectAnswer(row.result);
  if (!correct) return null;

  const digest = parseStoredDigest(row.digest_json);

  let partySplit: GamePartySplit[] | null = null;
  try {
    partySplit = await getPartySplitForRoll(db, parsed);
    if (partySplit.length === 0) partySplit = null;
  } catch {
    partySplit = null;
  }

  return {
    id: roundId,
    correct,
    vote: {
      chamber: row.chamber as "House" | "Senate",
      question: row.question,
      result: row.result,
      yeas: row.yeas,
      nays: row.nays,
      date: row.vote_date,
    },
    bill: {
      congress: row.bill_congress,
      type: row.bill_type,
      number: row.bill_number,
      title: row.title ?? null,
    },
    policy_area: row.policy_area ?? null,
    digest,
    party_split: partySplit,
  };
}

export function parseGameLimit(value: string | null, fallback = GAME_DEFAULT_LIMIT): number {
  return Math.min(
    GAME_MAX_LIMIT,
    Math.max(1, Number.parseInt(value ?? String(fallback), 10) || fallback)
  );
}
