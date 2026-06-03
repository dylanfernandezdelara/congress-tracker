import { handlePublicFetch } from "./http/router";
import type { Env } from "./config";

/**
 * Read-only entry used ONLY by `wrangler.remote.toml` (see the committed
 * `.example`) for safe local inspection of REAL production D1 via
 * `wrangler dev --config wrangler.remote.toml --remote`.
 *
 * It exposes only the public read API and deliberately omits the `/__pipeline/*`
 * admin routes, `scheduled`, and `queue` handlers. Those admin routes bypass auth
 * for localhost callers (see `pipeline-auth.ts`), so pointing a `--remote` session
 * at production D1 with the full `worker.ts` could let a local request trigger
 * ingestion/materialization against prod. This entry removes that footgun.
 *
 * Do NOT deploy with this entry; production deploys use `src/worker.ts` via
 * `wrangler.toml`.
 */
export default {
  fetch: handlePublicFetch,
} satisfies ExportedHandler<Env>;
