import {
  OG_CARD_HEIGHT,
  OG_CARD_SITE_LABEL,
  OG_CARD_WIDTH,
  ogCardBarSegments,
  ogCardLegend,
  ogCardStatusChipLabel,
  type OgCardBarSegment,
  type OgCardModel,
  type OgCardTally,
} from "../../../../shared/og-card";

const ACCENT = "#111827";
const INK = "#111827";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const QUOTE_MARK = "#d1d5db";
const CHIP_BORDER = "#e5e7eb";
const SANS = "Inter";
const SERIF = "Source Serif 4";
const WORDMARK = "TRACK CONGRESS";

const YEA_COLORS: Record<OgCardBarSegment["party"], string> = {
  D: "#2563eb",
  R: "#dc2626",
  I: "#7c3aed",
  Other: "#374151",
};

const NAY_COLORS: Record<OgCardBarSegment["party"], string> = {
  D: "#bfdbfe",
  R: "#fecaca",
  I: "#ddd6fe",
  Other: "#d1d5db",
};

export { ogCardLegend };

function escapeOgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function segmentColor(segment: OgCardBarSegment): string {
  return segment.side === "yea" ? YEA_COLORS[segment.party] : NAY_COLORS[segment.party];
}

function tallyBarHtml(tally: OgCardTally): string {
  const segments = ogCardBarSegments(tally);
  if (segments.length === 0) return "";
  const pieces = segments.map((segment, index) => {
    const gap = index < segments.length - 1 ? "margin-right:2px;" : "";
    return `<div style="display:flex;flex-grow:${segment.count};flex-basis:0;flex-shrink:1;height:14px;background-color:${segmentColor(segment)};${gap}"></div>`;
  });
  const legend = ogCardLegend(tally);
  return [
    `<div style="display:flex;flex-direction:column;width:100%;margin-top:14px;">`,
    `<div style="display:flex;flex-direction:row;width:100%;height:14px;border-radius:7px;overflow:hidden;background-color:#ffffff;">${pieces.join("")}</div>`,
    `<div style="display:flex;flex-direction:row;justify-content:space-between;width:100%;margin-top:8px;">`,
    `<div style="font-family:${SANS};font-size:18px;color:${MUTED};">${escapeOgText(legend.yea)}</div>`,
    `<div style="font-family:${SANS};font-size:18px;color:${MUTED};">${escapeOgText(legend.nay)}</div>`,
    `</div>`,
    `</div>`,
  ].join("");
}

function statusChipHtml(statusLine: string): string {
  const label = escapeOgText(ogCardStatusChipLabel(statusLine));
  return [
    `<div style="display:flex;margin-top:14px;">`,
    `<div style="border:2px solid ${CHIP_BORDER};border-radius:999px;padding:10px 18px;font-family:${SANS};font-size:22px;color:${INK};">${label}</div>`,
    `</div>`,
  ].join("");
}

function mainTextHtml(model: OgCardModel): string {
  if (model.quote) {
    return [
      `<div style="display:flex;flex-direction:column;width:100%;">`,
      `<div style="display:flex;flex-direction:row;width:100%;align-items:flex-start;">`,
      `<div style="font-family:'${SERIF}';font-size:120px;font-weight:500;line-height:0.8;color:${QUOTE_MARK};margin-right:16px;flex-shrink:0;">&#8220;</div>`,
      `<div style="display:block;flex:1;min-width:0;font-family:'${SERIF}';font-size:46px;font-weight:500;line-height:1.25;color:${INK};line-clamp:4;">${escapeOgText(model.quote)}</div>`,
      `</div>`,
      `<div style="display:block;width:100%;margin-top:16px;font-family:${SANS};font-size:22px;color:${MUTED};overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escapeOgText(model.headline)}</div>`,
      `</div>`,
    ].join("");
  }
  return `<div style="display:block;width:100%;font-family:${SANS};font-size:58px;font-weight:700;line-height:1.15;color:${INK};line-clamp:4;">${escapeOgText(model.headline)}</div>`;
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
    `<div style="font-family:${SANS};font-size:26px;font-weight:600;color:${INK};">${escapeOgText(model.status_line)}</div>`,
    extra,
    `<div style="display:flex;flex-direction:row;justify-content:flex-end;width:100%;margin-top:16px;">`,
    `<div style="font-family:${SANS};font-size:20px;color:${FAINT};">${escapeOgText(OG_CARD_SITE_LABEL)}</div>`,
    `</div>`,
    `</div>`,
  ].join("");
}

/** Deterministic 1200×630 satori HTML for the H4 tally share card. */
export function buildOgCardHtml(model: OgCardModel): string {
  const metaStyle = `font-family:${SANS};font-size:18px;font-weight:600;letter-spacing:2px;color:${MUTED};`;
  return [
    `<div style="display:flex;flex-direction:row;width:${OG_CARD_WIDTH}px;height:${OG_CARD_HEIGHT}px;background-color:#ffffff;">`,
    `<div style="width:6px;height:${OG_CARD_HEIGHT}px;background-color:${ACCENT};flex-shrink:0;"></div>`,
    `<div style="display:flex;flex-direction:column;flex:1;height:${OG_CARD_HEIGHT}px;padding:64px;">`,
    `<div style="display:flex;flex-direction:row;justify-content:space-between;width:100%;">`,
    `<div style="${metaStyle}">${WORDMARK}</div>`,
    `<div style="${metaStyle}">${escapeOgText(model.docket)}</div>`,
    `</div>`,
    `<div style="display:flex;flex-direction:column;flex:1;width:100%;justify-content:center;">`,
    mainTextHtml(model),
    `</div>`,
    bottomHtml(model),
    `</div>`,
    `</div>`,
  ].join("");
}
