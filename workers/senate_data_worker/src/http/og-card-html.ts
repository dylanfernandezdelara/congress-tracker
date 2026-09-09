import {
  OG_CARD_COLORS,
  OG_CARD_HEIGHT,
  OG_CARD_SITE_LABEL,
  OG_CARD_WIDTH,
  ogCardBarSegments,
  ogCardLegend,
  ogCardSegmentColor,
  ogCardStatusChipLabel,
  type OgCardModel,
  type OgCardTally,
} from "../../../../shared/og-card";

const { ink: INK, muted: MUTED, faint: FAINT, quoteMark: QUOTE_MARK, chipBorder: CHIP_BORDER, background: BACKGROUND } =
  OG_CARD_COLORS;
const ACCENT = INK;
const SANS = "Inter";
const SERIF = "Source Serif 4";
const WORDMARK = "TRACK CONGRESS";

export { ogCardLegend };

/**
 * workers-og parses HTML with HTMLRewriter and always hands satori an array of
 * children, so every div that carries text must be display:flex or satori throws.
 */
function textDiv(style: string, text: string): string {
  return `<div style="display:flex;${style}">${text}</div>`;
}

/**
 * HTMLRewriter text chunks reach satori undecoded, so entities would print
 * literally. Text is emitted verbatim; only angle brackets are swapped for
 * look-alike quotation marks so they cannot open a tag.
 */
function escapeOgText(value: string): string {
  return value.replace(/</g, "\u2039").replace(/>/g, "\u203a");
}

function tallyBarHtml(tally: OgCardTally): string {
  const segments = ogCardBarSegments(tally);
  if (segments.length === 0) return "";
  const pieces = segments.map((segment, index) => {
    const gap = index < segments.length - 1 ? "margin-right:2px;" : "";
    return `<div style="display:flex;flex-grow:${segment.count};flex-basis:0;flex-shrink:1;height:14px;background-color:${ogCardSegmentColor(segment)};${gap}"></div>`;
  });
  const legend = ogCardLegend(tally);
  return [
    `<div style="display:flex;flex-direction:column;width:100%;margin-top:14px;">`,
    `<div style="display:flex;flex-direction:row;width:100%;height:14px;border-radius:7px;overflow:hidden;background-color:${BACKGROUND};">${pieces.join("")}</div>`,
    `<div style="display:flex;flex-direction:row;justify-content:space-between;width:100%;margin-top:8px;">`,
    textDiv(`font-family:${SANS};font-size:18px;color:${MUTED};`, escapeOgText(legend.yea)),
    textDiv(`font-family:${SANS};font-size:18px;color:${MUTED};`, escapeOgText(legend.nay)),
    `</div>`,
    `</div>`,
  ].join("");
}

function statusChipHtml(statusLine: string): string {
  const label = escapeOgText(ogCardStatusChipLabel(statusLine));
  return [
    `<div style="display:flex;margin-top:14px;">`,
    textDiv(
      `border:2px solid ${CHIP_BORDER};border-radius:999px;padding:10px 18px;font-family:${SANS};font-size:22px;color:${INK};`,
      label
    ),
    `</div>`,
  ].join("");
}

function mainTextHtml(model: OgCardModel): string {
  if (model.quote) {
    return [
      `<div style="display:flex;flex-direction:column;width:100%;">`,
      `<div style="display:flex;flex-direction:row;width:100%;align-items:flex-start;">`,
      textDiv(
        `font-family:'${SERIF}';font-size:120px;font-weight:500;line-height:0.8;color:${QUOTE_MARK};margin-right:16px;flex-shrink:0;`,
        "\u201c"
      ),
      textDiv(
        `flex:1;min-width:0;font-family:'${SERIF}';font-size:46px;font-weight:500;line-height:1.25;color:${INK};line-clamp:4;`,
        escapeOgText(model.quote)
      ),
      `</div>`,
      textDiv(
        `width:100%;margin-top:16px;font-family:${SANS};font-size:22px;color:${MUTED};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;`,
        escapeOgText(model.headline)
      ),
      `</div>`,
    ].join("");
  }
  return textDiv(
    `width:100%;font-family:${SANS};font-size:58px;font-weight:700;line-height:1.15;color:${INK};line-clamp:4;`,
    escapeOgText(model.headline)
  );
}

function bottomHtml(model: OgCardModel): string {
  const segments = model.tally ? ogCardBarSegments(model.tally) : [];
  const extra =
    model.tally && segments.length > 0
      ? tallyBarHtml(model.tally)
      : model.tally === null
        ? statusChipHtml(model.status_line)
        : "";
  return [
    `<div style="display:flex;flex-direction:column;width:100%;">`,
    textDiv(`font-family:${SANS};font-size:26px;font-weight:600;color:${INK};`, escapeOgText(model.status_line)),
    extra,
    `<div style="display:flex;flex-direction:row;justify-content:flex-end;width:100%;margin-top:16px;">`,
    textDiv(`font-family:${SANS};font-size:20px;color:${FAINT};`, escapeOgText(OG_CARD_SITE_LABEL)),
    `</div>`,
    `</div>`,
  ].join("");
}

/** Deterministic 1200×630 satori HTML for the H4 tally share card. */
export function buildOgCardHtml(model: OgCardModel): string {
  const metaStyle = `font-family:${SANS};font-size:18px;font-weight:600;letter-spacing:2px;color:${MUTED};`;
  return [
    `<div style="display:flex;flex-direction:row;width:${OG_CARD_WIDTH}px;height:${OG_CARD_HEIGHT}px;background-color:${BACKGROUND};">`,
    `<div style="display:flex;width:6px;height:${OG_CARD_HEIGHT}px;background-color:${ACCENT};flex-shrink:0;"></div>`,
    `<div style="display:flex;flex-direction:column;flex:1;height:${OG_CARD_HEIGHT}px;padding:64px;">`,
    `<div style="display:flex;flex-direction:row;justify-content:space-between;width:100%;">`,
    textDiv(metaStyle, WORDMARK),
    textDiv(metaStyle, escapeOgText(model.docket)),
    `</div>`,
    `<div style="display:flex;flex-direction:column;flex:1;width:100%;justify-content:center;">`,
    mainTextHtml(model),
    `</div>`,
    bottomHtml(model),
    `</div>`,
    `</div>`,
  ].join("");
}
