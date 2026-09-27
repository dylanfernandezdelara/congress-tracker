/** Site-wide legal chrome: independent / non-government affiliation, and how summaries are made. */
export function SiteFooter() {
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
    </footer>
  )
}
