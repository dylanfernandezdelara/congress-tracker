import type { IngestMonitorStatus } from "./ingest-api-types";

export function isIngestMonitorHealthy(status: IngestMonitorStatus | string | null | undefined): boolean;

export function isIngestMonitorOpsAcceptable(
  status: IngestMonitorStatus | string | null | undefined
): boolean;
