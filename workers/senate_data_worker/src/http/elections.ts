import { STATE_GUIDES_2026 } from "../../../../shared/elections-2026/index";
import { isCompetitiveRace, ELECTION_DAY_2026 } from "../../../../shared/elections-2026/types";
import { US_STATE_OPTIONS } from "../../../../shared/us-states";
import type {
  ElectionsIndexResponse,
  ElectionsLocateResponse,
} from "../../../../shared/elections-2026/api-types";
import { cacheNoStore, type JsonResponseBuilder } from "./responses";

/** Guide data ships with the deploy, so edge copies only go stale on redeploy. */
const cacheGuide = "s-maxage=300, stale-while-revalidate=60";

const STATE_PATH = /^\/elections\/2026\/state\/([A-Za-z]{2})\.json$/;

function buildIndex(): ElectionsIndexResponse {
  const states = US_STATE_OPTIONS.flatMap(({ code, name }) => {
    const guide = STATE_GUIDES_2026[code];
    if (!guide) return [];
    return [
      {
        code,
        name,
        status: guide.status,
        races: guide.races.length,
        competitive: guide.races.filter(isCompetitiveRace).length,
      },
    ];
  });
  return { election_day: ELECTION_DAY_2026, states };
}

/** Cloudflare's IP geolocation; never stored or logged. */
export function locateState(request: Request): string | null {
  const cf = (request as Request & { cf?: { country?: string; regionCode?: string } }).cf;
  if (cf?.country !== "US" || !cf.regionCode) return null;
  const code = cf.regionCode.toUpperCase();
  return STATE_GUIDES_2026[code] ? code : null;
}

/** GET /elections/2026/{index,locate,state/XX}.json; null when the path isn't an elections route. */
export function handleElectionsRoute(
  request: Request,
  pathname: string,
  json: JsonResponseBuilder
): Response | null {
  if (pathname === "/elections/2026/index.json") {
    return json(buildIndex(), { status: 200, headers: { "Cache-Control": cacheGuide } });
  }
  if (pathname === "/elections/2026/locate.json") {
    const body: ElectionsLocateResponse = { state: locateState(request) };
    // Varies per visitor: never cache at the edge.
    return json(body, { status: 200, headers: { "Cache-Control": `private, ${cacheNoStore}` } });
  }
  const match = STATE_PATH.exec(pathname);
  if (match) {
    const guide = STATE_GUIDES_2026[match[1].toUpperCase()];
    if (!guide) {
      return json({ error: "not_found", message: "Unknown state", path: pathname }, { status: 404 });
    }
    return json(guide, { status: 200, headers: { "Cache-Control": cacheGuide } });
  }
  return null;
}
