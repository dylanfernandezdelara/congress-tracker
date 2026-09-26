import {
  OG_CARD_COLORS,
  OG_CARD_HEIGHT,
  OG_CARD_WIDTH,
  ogCardSideSegments,
  type OgCardModel,
  type OgCardTally,
} from "../../../../shared/og-card";

const C = OG_CARD_COLORS;
const SANS = "Inter";
const WORDMARK = "Track Congress";
const LEFT_WIDTH = 720;
const BAR_HEIGHT = 24;

/**
 * workers-og parses HTML with HTMLRewriter and always hands satori an array of
 * children, so every div that carries text must be display:flex or satori throws.
 */
function div(style: string, inner = ""): string {
  return `<div style="display:flex;${style}">${inner}</div>`;
}

/**
 * HTMLRewriter text chunks reach satori undecoded, so entities would print
 * literally. Text is emitted verbatim; only angle brackets are swapped for
 * look-alike quotation marks so they cannot open a tag.
 */
function escapeOgText(value: string): string {
  return value.replace(/</g, "‹").replace(/>/g, "›");
}

/**
 * One side's votes as a bar split by party, on the scale of all votes cast so
 * the yes and no bars compare. The unfilled rest is the track.
 */
function sideBar(tally: OgCardTally, side: "yea" | "nay"): string {
  const total = tally.yeas + tally.nays;
  const segments = ogCardSideSegments(tally, side);
  const filled = segments.reduce((sum, segment) => sum + segment.count, 0);
  const pieces = segments.map((segment) =>
    div(`flex-grow:${segment.count};flex-basis:0;height:${BAR_HEIGHT}px;background-color:${C.party[segment.party]};`)
  );
  if (total - filled > 0) {
    pieces.push(div(`flex-grow:${total - filled};flex-basis:0;height:${BAR_HEIGHT}px;background-color:${C.track};`));
  }
  return div(
    `flex-direction:row;width:100%;height:${BAR_HEIGHT}px;border-radius:${BAR_HEIGHT / 2}px;overflow:hidden;background-color:${C.track};`,
    pieces.join("")
  );
}

/** A tick at two-thirds of the votes cast, labeled, crossing the yes bar. */
function twoThirdsTick(): string {
  return div(
    `position:absolute;left:${(2 / 3) * 100}%;top:-26px;width:40px;margin-left:-20px;flex-direction:column;align-items:center;`,
    div(`font-family:${SANS};font-size:18px;font-weight:700;color:${C.ink};height:22px;`, "2/3") +
      div(`width:4px;height:${BAR_HEIGHT + 14}px;border-radius:2px;background-color:${C.ink};`)
  );
}

function countRow(tally: OgCardTally, side: "yea" | "nay", twoThirds: boolean): string {
  const count = side === "yea" ? tally.yeas : tally.nays;
  const tick = side === "yea" && twoThirds;
  return div(
    `flex-direction:column;width:100%;margin-top:${tick ? 34 : 26}px;`,
    div(
      "flex-direction:row;align-items:baseline;",
      div(
        `font-family:${SANS};font-size:104px;font-weight:700;line-height:1;letter-spacing:-3px;color:${side === "yea" ? C.ink : C.tertiary};`,
        String(count)
      ) +
        div(
          `font-family:${SANS};font-size:30px;font-weight:600;color:${C.secondary};margin-left:12px;`,
          side === "yea" ? "yes" : "no"
        )
    ) +
      div(
        `position:relative;flex-direction:column;width:100%;margin-top:${tick ? 30 : 0}px;`,
        sideBar(tally, side) + (tick ? twoThirdsTick() : "")
      )
  );
}

function outcomePanel(model: OgCardModel): string {
  if (model.tally) {
    return (
      div(`font-family:${SANS};font-size:32px;font-weight:700;color:${C.ink};`, escapeOgText(model.outcome_label)) +
      countRow(model.tally, "yea", model.two_thirds) +
      countRow(model.tally, "nay", false)
    );
  }
  if (model.outcome_date) {
    return (
      div(
        `font-family:${SANS};font-size:32px;font-weight:700;color:${model.outcome === "law" ? C.law : C.ink};`,
        escapeOgText(model.outcome_label)
      ) +
      div(
        `font-family:${SANS};font-size:56px;font-weight:700;line-height:1.1;letter-spacing:-1px;color:${C.ink};margin-top:20px;`,
        escapeOgText(model.outcome_date)
      )
    );
  }
  return div(
    `font-family:${SANS};font-size:56px;font-weight:700;line-height:1.1;letter-spacing:-1px;color:${C.secondary};`,
    escapeOgText(model.outcome_label)
  );
}

/**
 * Deterministic 1200×630 satori HTML for the share card: wordmark and bill
 * number, the headline, and on the right the outcome with a yes and a no count,
 * each over a bar colored by the parties that cast those votes.
 */
export function buildOgCardHtml(model: OgCardModel): string {
  return div(
    `flex-direction:row;width:${OG_CARD_WIDTH}px;height:${OG_CARD_HEIGHT}px;background-color:${C.page};`,
    div(
      `flex-direction:column;width:${LEFT_WIDTH}px;height:${OG_CARD_HEIGHT}px;padding:64px 48px 64px 72px;`,
      div(
        `font-family:${SANS};font-size:22px;font-weight:600;color:${C.tertiary};`,
        escapeOgText(`${WORDMARK} · ${model.bill_label}`)
      ) +
        div(
          `flex:1;align-items:center;font-family:${SANS};font-size:60px;font-weight:700;line-height:1.1;letter-spacing:-1px;color:${C.ink};`,
          escapeOgText(model.headline)
        )
    ) +
      div(
        `flex-direction:column;justify-content:center;width:${OG_CARD_WIDTH - LEFT_WIDTH}px;height:${OG_CARD_HEIGHT}px;padding:56px 52px;background-color:${C.panel};`,
        outcomePanel(model)
      )
  );
}
