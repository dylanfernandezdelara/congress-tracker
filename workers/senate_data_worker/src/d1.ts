export { ensurePlatformSchema, PLATFORM_SCHEMA_SQL } from "./d1/schema";
export {
  readKnownVoteNumbersFromD1,
  readIngestedVoteDetailsFromD1,
  writeIngestedVoteDetailsToD1,
} from "./d1/ingested-votes";
export type { SourceFetchLogRecord } from "./d1/source-log";
export { recordSourceFetchLog, readSourceFetchLog } from "./d1/source-log";
export type { PipelineCheckpointRecord } from "./d1/checkpoints";
export { writePipelineCheckpoint, readPipelineCheckpoint } from "./d1/checkpoints";
export type {
  RecordDocumentWrite,
  VoteArgumentExcerptWrite,
  VoteEvidenceWrite,
} from "./d1/materialization";
export {
  writePlatformMaterializationToD1,
  writeHistoricalVoteBatchToD1,
  writeVoteEvidenceToD1,
  readLatestBriefingFromD1,
  readVoteDetailFromD1,
} from "./d1/materialization";
