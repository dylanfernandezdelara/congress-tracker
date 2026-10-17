import { SUPPORT_URL } from '../constants/support'

/**
 * Site-wide legal chrome: independent / non-government affiliation, how summaries are made,
 * and (when `supportUrl` is set) a quiet way to chip in for hosting and summaries.
 */
export function SiteFooter({ supportUrl = SUPPORT_URL }: { supportUrl?: string | null } = {}) {
  return (
    <footer className="site-footer" role="contentinfo">
      <p className="site-footer-disclaimer">
        Track Congress is an independent, unofficial website. It is not affiliated with,
        endorsed by, or operated by the U.S. Congress or any federal government agency.
      </p>
      <p className="site-footer-disclaimer">
        Plain-language bill summaries are written by a language model from the bill&rsquo;s text
        (or, until the text is published, from its title or the CRS summary) and screened for
        numbers and wording the sources do not support. The official CRS summary, when one
        exists, is available beneath each one.
      </p>
      {supportUrl ? (
        <p className="site-footer-disclaimer">
          Track Congress is free, has no ads, and is run by one person. If it&rsquo;s useful to
          you,{' '}
          <a
            className="site-footer-link"
            href={supportUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            chip in to cover hosting and summaries
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          . Contributions are not tax-deductible.
        </p>
      ) : null}
    </footer>
  )
}
