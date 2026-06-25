export const HOUSING_SAVE_POST_TEXT =
  "Today's Housing News Conference and Signing is hereby cancelled until such time as we pass the desperately needed SAVE AMERICA ACT, which I consider to be a National Emergency. Thank you for your attention to this matter! President DJT";

export const HOUSING_SAVE_POST_ID = "116805545512296111";

export const HOUSING_SAVE_LLM_RESULT = {
  linked_bills: [
    {
      congress: 119,
      type: "HR",
      number: 6644,
      role: "primary" as const,
      confidence: 0.96,
      rationale: "Post cancels housing signing ceremony",
    },
    {
      congress: 119,
      type: "HR",
      number: 22,
      role: "conditional" as const,
      confidence: 0.94,
      rationale: "Signing delayed until SAVE America Act passes",
    },
  ],
  banner_summary: "Cancelled housing signing until SAVE Act passes",
  informal: true,
};

export const HOUSING_SAVE_CATALOG = [
  {
    congress: 119,
    type: "HR",
    number: 6644,
    title: "21st Century ROAD to Housing Act",
    headline: "Overhauls federal housing programs",
    policy_area: "Housing",
  },
  {
    congress: 119,
    type: "HR",
    number: 22,
    title: "SAVE Act",
    headline: "Voter eligibility and registration requirements",
    policy_area: "Government operations and politics",
  },
];

export const HOUSING_SAVE_STATUS_PAGE_HTML = `<!doctype html>
<html><head>
<meta property="og:description" content="Today&#x2019;s&#x20;Housing&#x20;News&#x20;Conference&#x20;and&#x20;Signing&#x20;is&#x20;hereby&#x20;cancelled&#x20;until&#x20;such&#x20;time&#x20;as&#x20;we&#x20;pass&#x20;the&#x20;desperately&#x20;needed&#x20;SAVE&#x20;AMERICA&#x20;ACT,&#x20;which&#x20;I&#x20;consider&#x20;to&#x20;be&#x20;a&#x20;National&#x20;Emergency.&#x20;Thank&#x20;you&#x20;for&#x20;your&#x20;attention&#x20;to&#x20;this&#x20;matter&#x21;&#x20;President&#x20;DJT">
</head><body>
<a href="https://truthsocial.com/@realDonaldTrump/116805545512296111">Truth</a>
June 24, 2026, 10:26 AM
</body></html>`;
