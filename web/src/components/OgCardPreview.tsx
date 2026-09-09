import {
  OG_CARD_SITE_LABEL,
  ogCardBarSegments,
  ogCardLegend,
  ogCardStatusChipLabel,
  type OgCardBarSegment,
  type OgCardModel,
} from '@congress-tracker/shared/og-card'

type OgCardPreviewProps = {
  model: OgCardModel
}

function segmentClass(segment: OgCardBarSegment): string {
  return `og-card-bar-seg og-card-bar-seg--${segment.side} og-card-bar-seg--${segment.party.toLowerCase()}`
}

/**
 * HTML twin of the worker's 1200×630 share PNG (`/og/bill/:id.png`). Sized with
 * container-query units so it scales with the sheet while keeping the PNG's
 * proportions; colors are fixed (the card is always light, like the image).
 */
export function OgCardPreview({ model }: OgCardPreviewProps) {
  const segments = model.tally ? ogCardBarSegments(model.tally) : []
  const legend = model.tally ? ogCardLegend(model.tally) : null

  return (
    <div className="og-card-preview" data-testid="og-card-preview" aria-hidden="true">
      <div className="og-card">
        <div className="og-card-accent" />
        <div className="og-card-body">
          <div className="og-card-meta">
            <span>TRACK CONGRESS</span>
            <span>{model.docket}</span>
          </div>
          <div className="og-card-main">
            {model.quote ? (
              <>
                <div className="og-card-quote-row">
                  <span className="og-card-quote-mark">“</span>
                  <p className="og-card-quote">{model.quote}</p>
                </div>
                <p className="og-card-subline">{model.headline}</p>
              </>
            ) : (
              <p className="og-card-headline">{model.headline}</p>
            )}
          </div>
          <div className="og-card-bottom">
            <p className="og-card-status">{model.status_line}</p>
            {model.tally && segments.length > 0 && legend ? (
              <div className="og-card-tally">
                <div className="og-card-bar">
                  {segments.map((segment, index) => (
                    <span
                      key={`${segment.side}-${segment.party}-${index}`}
                      className={segmentClass(segment)}
                      style={{ flexGrow: segment.count }}
                    />
                  ))}
                </div>
                <div className="og-card-legend">
                  <span>{legend.yea}</span>
                  <span>{legend.nay}</span>
                </div>
              </div>
            ) : model.tally === null ? (
              <div className="og-card-chip-row">
                <span className="og-card-chip">{ogCardStatusChipLabel(model.status_line)}</span>
              </div>
            ) : null}
            <p className="og-card-site">{OG_CARD_SITE_LABEL}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
