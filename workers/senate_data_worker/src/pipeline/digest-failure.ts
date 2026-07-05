import type { DigestFailureReason } from "../../../../shared/digest-failure";
import type { FeedPipelineTrigger } from "../../../../shared/ingest-api-types";

export function logDigestFailure(params: {
  bill: string;
  reason: DigestFailureReason;
  trigger: FeedPipelineTrigger;
}): void {
  console.error(
    JSON.stringify({
      event: "digest_rewrite_failed",
      bill: params.bill,
      reason: params.reason,
      trigger: params.trigger,
    })
  );
}
