function About() {
  return (
    <div className="page">
      <h1>About</h1>
      <p className="about__body">
        Senate Pulse is a public-interest dashboard that summarizes recent U.S. Senate activity using
        precomputed data from our Cloudflare Worker pipeline. The project combines official sources
        (Congress.gov, Senate.gov, and GovInfo) with transparent, reproducible processing so readers
        can quickly see what changed, who was affected, and which votes were decisive. We prioritize
        clear sourcing, deterministic outputs, and operational checks that keep the published data
        trustworthy for everyday use.
      </p>
    </div>
  )
}

export default About

