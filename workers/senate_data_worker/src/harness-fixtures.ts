export interface HarnessFixtureEntry {
  url: string;
  contentType: string;
  body: string;
  status?: number;
}

const voteMenuXml = `<?xml version="1.0" encoding="UTF-8"?>
<vote_summary>
  <congress>119</congress>
  <session>2</session>
  <congress_year>2026</congress_year>
  <votes>
    <vote>
      <vote_number>12</vote_number>
      <vote_date>January 15, 2026</vote_date>
      <issue>S. 210</issue>
      <question>On Passage of the Bill</question>
      <result>Agreed to</result>
      <vote_title>S. 210 - Clean Transit Access Act</vote_title>
    </vote>
    <vote>
      <vote_number>13</vote_number>
      <vote_date>January 15, 2026</vote_date>
      <issue>S. 198</issue>
      <question>On the Motion to Invoke Cloture</question>
      <result>Agreed to</result>
      <vote_title>S. 198 - Veterans Housing Stability Act</vote_title>
    </vote>
    <vote>
      <vote_number>14</vote_number>
      <vote_date>January 17, 2026</vote_date>
      <issue>S. 303</issue>
      <question>On Passage of the Bill</question>
      <result>Agreed to</result>
      <vote_title>S. 303 - Border Infrastructure Modernization Act</vote_title>
    </vote>
  </votes>
</vote_summary>
`;

function voteDetailXml(
  voteNumber: number,
  voteDate: string,
  question: string,
  document: string,
  result: string,
  title: string,
  counts: { yeas: number; nays: number; present: number; notVoting: number },
  members: Array<{ name: string; id: string; party: string; state: string; cast: string }>
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<roll_call_vote>
  <congress>119</congress>
  <session>2</session>
  <vote_number>${voteNumber}</vote_number>
  <vote_date>${voteDate}</vote_date>
  <vote_question_text>${question}</vote_question_text>
  <vote_document_text>${document}</vote_document_text>
  <vote_result_text>${result}</vote_result_text>
  <vote_title>${title}</vote_title>
  <count>
    <yeas>${counts.yeas}</yeas>
    <nays>${counts.nays}</nays>
    <present>${counts.present}</present>
    <not_voting>${counts.notVoting}</not_voting>
  </count>
  <members>
${members
  .map(
    (member) => `    <member>
      <member_full>${member.name}</member_full>
      <lis_member_id>${member.id}</lis_member_id>
      <party>${member.party}</party>
      <state>${member.state}</state>
      <vote_cast>${member.cast}</vote_cast>
    </member>`
  )
  .join("\n")}
  </members>
</roll_call_vote>
`;
}

const vote12Xml = voteDetailXml(
  12,
  "January 15, 2026",
  "On Passage of the Bill",
  "S. 210",
  "Agreed to",
  "S. 210 - Clean Transit Access Act",
  { yeas: 67, nays: 32, present: 1, notVoting: 0 },
  [
    { name: "Schumer, Charles E.", id: "S000148", party: "D", state: "NY", cast: "Yea" },
    { name: "Gillibrand, Kirsten E.", id: "G000555", party: "D", state: "NY", cast: "Yea" },
    { name: "Cruz, Ted", id: "C001098", party: "R", state: "TX", cast: "Nay" },
    { name: "Cornyn, John", id: "C001056", party: "R", state: "TX", cast: "Yea" }
  ]
);

const vote13Xml = voteDetailXml(
  13,
  "January 15, 2026",
  "On the Motion to Invoke Cloture",
  "S. 198",
  "Agreed to",
  "S. 198 - Veterans Housing Stability Act",
  { yeas: 60, nays: 40, present: 0, notVoting: 0 },
  [
    { name: "Schumer, Charles E.", id: "S000148", party: "D", state: "NY", cast: "Yea" },
    { name: "Gillibrand, Kirsten E.", id: "G000555", party: "D", state: "NY", cast: "Yea" },
    { name: "Cruz, Ted", id: "C001098", party: "R", state: "TX", cast: "Nay" },
    { name: "Cornyn, John", id: "C001056", party: "R", state: "TX", cast: "Yea" }
  ]
);

const vote14Xml = voteDetailXml(
  14,
  "January 17, 2026",
  "On Passage of the Bill",
  "S. 303",
  "Agreed to",
  "S. 303 - Border Infrastructure Modernization Act",
  { yeas: 52, nays: 48, present: 0, notVoting: 0 },
  [
    { name: "Schumer, Charles E.", id: "S000148", party: "D", state: "NY", cast: "Nay" },
    { name: "Gillibrand, Kirsten E.", id: "G000555", party: "D", state: "NY", cast: "Yea" },
    { name: "Cruz, Ted", id: "C001098", party: "R", state: "TX", cast: "Yea" },
    { name: "Cornyn, John", id: "C001056", party: "R", state: "TX", cast: "Nay" }
  ]
);

const floorScheduleXml = `<?xml version="1.0" encoding="UTF-8"?>
<CongressSessionDayConvenings>
  <LegislativeDay>
    <LegislativeDayDate>2026-01-20</LegislativeDayDate>
    <SessionDay>
      <ConveneDate>2026-01-20T14:00:00</ConveneDate>
      <AdjournDate>2026-01-20T18:30:00</AdjournDate>
      <AdjournType>Until tomorrow</AdjournType>
      <NextConveneDate>2026-01-21T14:00:00</NextConveneDate>
    </SessionDay>
  </LegislativeDay>
</CongressSessionDayConvenings>
`;

const committeeScheduleXml = `<?xml version="1.0" encoding="UTF-8"?>
<schedule>
  <meeting>
    <committee>Committee on Finance</committee>
    <meeting_date>2026-01-21</meeting_date>
    <time>10:00 AM</time>
    <matter>FY 2026 budget priorities hearing</matter>
    <location>Dirksen 215</location>
  </meeting>
</schedule>
`;

const floorLogIndexHtml = `<!doctype html>
<html>
  <body>
    <a href="https://www.periodicalpress.senate.gov/2026/01/17/senate-floor-log-january-17-2026/">Senate floor log January 17 2026</a>
  </body>
</html>
`;

const floorLogHtml = `<!doctype html>
<html>
  <body>
    <article>
      <h1>Senate floor log January 17, 2026</h1>
      <p>The Senate resumed consideration of S. 303, the Border Infrastructure Modernization Act, before the afternoon roll call.</p>
      <p>Members debated funding for port-of-entry modernization, border staffing capacity, and freight screening upgrades before the bill passed 52-48.</p>
      <p>Leadership described the measure as a major border infrastructure package with immediate national-security and commerce implications.</p>
    </article>
  </body>
</html>
`;

const digestText = `Congressional Record Daily Digest

The Senate considered S. 303, the Border Infrastructure Modernization Act, and later passed the measure after debate over port-of-entry modernization and border logistics funding.
`;

const senateRecordText = `Congressional Record - Senate

The Senate resumed consideration of S. 303, the Border Infrastructure Modernization Act. Senators described the bill as modernizing ports of entry, reducing freight bottlenecks, and strengthening border screening infrastructure.
`;

const granuleText = `Congressional Record Senate Granule

Debate on S. 303, the Border Infrastructure Modernization Act, focused on border crossing infrastructure, customs facilities, and the operational impact on trade and travel.
`;

function json(value: unknown): string {
  return JSON.stringify(value);
}

export const canonicalHarnessFixtures: HarnessFixtureEntry[] = [
  {
    url: "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml",
    contentType: "application/xml",
    body: voteMenuXml,
  },
  {
    url: "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00012.xml",
    contentType: "application/xml",
    body: vote12Xml,
  },
  {
    url: "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00013.xml",
    contentType: "application/xml",
    body: vote13Xml,
  },
  {
    url: "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00014.xml",
    contentType: "application/xml",
    body: vote14Xml,
  },
  {
    url: "https://www.senate.gov/legislative/schedule/floor_schedule.xml",
    contentType: "application/xml",
    body: floorScheduleXml,
  },
  {
    url: "https://www.senate.gov/general/committee_schedules/hearings.xml",
    contentType: "application/xml",
    body: committeeScheduleXml,
  },
  {
    url: "https://www.periodicalpress.senate.gov/category/floor-logs/",
    contentType: "text/html; charset=utf-8",
    body: floorLogIndexHtml,
  },
  {
    url: "https://www.periodicalpress.senate.gov/2026/01/17/senate-floor-log-january-17-2026/",
    contentType: "text/html; charset=utf-8",
    body: floorLogHtml,
  },
  {
    url: "https://api.congress.gov/v3/member/congress/119?currentMember=true&format=json&limit=250&offset=0",
    contentType: "application/json",
    body: json({
      members: [
        {
          bioguideId: "S000148",
          name: "Schumer, Charles E.",
          partyName: "Democratic",
          state: "NY",
          terms: { item: [{ chamber: "Senate", startYear: 1999 }] },
        },
        {
          bioguideId: "G000555",
          name: "Gillibrand, Kirsten E.",
          partyName: "Democratic",
          state: "NY",
          terms: { item: [{ chamber: "Senate", startYear: 2009 }] },
        },
        {
          bioguideId: "C001098",
          name: "Cruz, Ted",
          partyName: "Republican",
          state: "TX",
          terms: { item: [{ chamber: "Senate", startYear: 2013 }] },
        },
        {
          bioguideId: "C001056",
          name: "Cornyn, John",
          partyName: "Republican",
          state: "TX",
          terms: { item: [{ chamber: "Senate", startYear: 2002 }] },
        },
      ],
      pagination: { count: 4, offset: 0, limit: 250 },
    }),
  },
  {
    url: "https://api.congress.gov/v3/member/S000148?format=json&item=sponsored-legislation&limit=250&offset=0",
    contentType: "application/json",
    body: json({
      sponsoredLegislation: [
        {
          latestAction: { actionDate: "2026-01-15", text: "Introduced in Senate" },
          title: "Clean Transit Access Act",
          congress: 119,
          type: "S",
          number: "210",
          url: "https://www.congress.gov/bill/119th-congress/senate-bill/210",
        },
      ],
      pagination: { count: 1, offset: 0, limit: 250 },
    }),
  },
  {
    url: "https://api.congress.gov/v3/member/S000148?cosponsor=true&format=json&limit=250&offset=0",
    contentType: "application/json",
    body: json({}),
    status: 404,
  },
  {
    url: "https://api.congress.gov/v3/member/S000148?format=json&item=cosponsored-legislation&limit=250&offset=0",
    contentType: "application/json",
    body: json({ cosponsoredLegislation: [], pagination: { count: 0, offset: 0, limit: 250 } }),
  },
  {
    url: "https://api.congress.gov/v3/member/G000555?format=json&item=sponsored-legislation&limit=250&offset=0",
    contentType: "application/json",
    body: json({
      sponsoredLegislation: [
        {
          latestAction: { actionDate: "2026-01-15", text: "Introduced in Senate" },
          title: "Veterans Housing Stability Act",
          congress: 119,
          type: "S",
          number: "198",
          url: "https://www.congress.gov/bill/119th-congress/senate-bill/198",
        },
      ],
      pagination: { count: 1, offset: 0, limit: 250 },
    }),
  },
  {
    url: "https://api.congress.gov/v3/member/G000555?format=json&item=cosponsored-legislation&limit=250&offset=0",
    contentType: "application/json",
    body: json({ cosponsoredLegislation: [], pagination: { count: 0, offset: 0, limit: 250 } }),
  },
  {
    url: "https://api.congress.gov/v3/member/C001098?format=json&item=sponsored-legislation&limit=250&offset=0",
    contentType: "application/json",
    body: json({
      sponsoredLegislation: [
        {
          latestAction: { actionDate: "2026-01-17", text: "Introduced in Senate" },
          title: "Border Infrastructure Modernization Act",
          congress: 119,
          type: "S",
          number: "303",
          url: "https://www.congress.gov/bill/119th-congress/senate-bill/303",
        },
      ],
      pagination: { count: 1, offset: 0, limit: 250 },
    }),
  },
  {
    url: "https://api.congress.gov/v3/member/C001098?format=json&item=cosponsored-legislation&limit=250&offset=0",
    contentType: "application/json",
    body: json({ cosponsoredLegislation: [], pagination: { count: 0, offset: 0, limit: 250 } }),
  },
  {
    url: "https://api.congress.gov/v3/member/C001056?format=json&item=sponsored-legislation&limit=250&offset=0",
    contentType: "application/json",
    body: json({ sponsoredLegislation: [], pagination: { count: 0, offset: 0, limit: 250 } }),
  },
  {
    url: "https://api.congress.gov/v3/member/C001056?format=json&item=cosponsored-legislation&limit=250&offset=0",
    contentType: "application/json",
    body: json({
      cosponsoredLegislation: [
        {
          latestAction: { actionDate: "2026-01-17", text: "Cosponsored in Senate" },
          title: "Border Infrastructure Modernization Act",
          congress: 119,
          type: "S",
          number: "303",
          url: "https://www.congress.gov/bill/119th-congress/senate-bill/303",
        },
      ],
      pagination: { count: 1, offset: 0, limit: 250 },
    }),
  },
  {
    url: "https://api.congress.gov/v3/committee-meeting/119/senate?format=json&fromDateTime=2025-12-22T00%3A00%3A00Z&limit=120&offset=0&toDateTime=2026-02-19T23%3A59%3A59Z",
    contentType: "application/json",
    body: json({
      committeeMeetings: [
        {
          eventId: "1001",
          congress: 119,
          chamber: "Senate",
          updateDate: "2026-01-18T15:00:00Z",
          url: "https://www.congress.gov/event/119th-congress/senate-event/1001",
        },
      ],
      pagination: { count: 1, offset: 0, limit: 120 },
    }),
  },
  {
    url: "https://api.congress.gov/v3/committee-meeting/119/senate/1001?format=json",
    contentType: "application/json",
    body: json({
      committeeMeeting: {
        eventId: "1001",
        date: "2026-01-21T15:00:00Z",
        title: "Committee on Finance hearing on FY 2026 budget priorities",
        committees: [{ name: "Committee on Finance", systemCode: "ssfi00" }],
        location: { building: "Dirksen", room: "215" },
        meetingDocuments: [
          {
            documentType: "Hearing",
            description: "Discussion of federal budget priorities and agency oversight.",
            url: "https://www.congress.gov/event/119th-congress/senate-event/1001/documents",
          },
        ],
      },
    }),
  },
  {
    url: "https://api.congress.gov/v3/daily-congressional-record?format=json&limit=24&offset=0",
    contentType: "application/json",
    body: json({
      dailyCongressionalRecord: [
        {
          volumeNumber: 172,
          issueNumber: "7",
          issueDate: "2026-01-17",
        },
      ],
      pagination: { count: 1, offset: 0, limit: 24 },
    }),
  },
  {
    url: "https://api.congress.gov/v3/daily-congressional-record/172/7/articles?format=json&limit=250&offset=0",
    contentType: "application/json",
    body: json({
      articles: [
        {
          name: "Senate",
          sectionArticles: [
            {
              title: "Debate on S. 303 Border Infrastructure Modernization Act",
              startPage: "S123",
              endPage: "S126",
              text: [
                {
                  type: "Formatted Text",
                  url: "https://www.congress.gov/record/2026/01/17/senate-border-infrastructure.txt",
                },
              ],
            },
          ],
        },
      ],
    }),
  },
  {
    url: "https://www.congress.gov/record/2026/01/17/senate-border-infrastructure.txt",
    contentType: "text/plain; charset=utf-8",
    body: senateRecordText,
  },
  {
    url: "https://api.govinfo.gov/published/2026-01-20/2026-01-20?collection=CREC&docClass=DIGEST&offsetMark=*&pageSize=10",
    contentType: "application/json",
    body: json({
      packages: [
        {
          packageId: "CREC-2026-01-20",
          title: "Congressional Record Daily Digest",
          dateIssued: "2026-01-20",
          docClass: "DIGEST",
        },
      ],
    }),
  },
  {
    url: "https://api.govinfo.gov/packages/CREC-2026-01-20/summary",
    contentType: "application/json",
    body: json({
      title: "Congressional Record Daily Digest",
      dateIssued: "2026-01-20",
      detailsLink: "https://www.govinfo.gov/app/details/CREC-2026-01-20",
      download: {
        txtLink: "https://www.govinfo.gov/content/pkg/CREC-2026-01-20/html/CREC-2026-01-20-Dg.xml",
      },
    }),
  },
  {
    url: "https://api.govinfo.gov/packages/CREC-2026-01-20/granules?offsetMark=*&pageSize=250",
    contentType: "application/json",
    body: json({
      count: 1,
      granules: [
        {
          granuleId: "CREC-2026-01-20-pt1-PgD1",
          title: "Daily Digest/Senate - Border Infrastructure Modernization Act",
          granuleClass: "DailyDigest",
        },
      ],
    }),
  },
  {
    url: "https://api.govinfo.gov/packages/CREC-2026-01-20/granules/CREC-2026-01-20-pt1-PgD1/summary",
    contentType: "application/json",
    body: json({
      title: "Daily Digest/Senate - Border Infrastructure Modernization Act",
      granuleId: "CREC-2026-01-20-pt1-PgD1",
      dateIssued: "2026-01-20",
      packageId: "CREC-2026-01-20",
      granuleClass: "DailyDigest",
      download: {
        txtLink: "https://www.govinfo.gov/content/pkg/CREC-2026-01-20/txt/CREC-2026-01-20-pt1-PgD1.txt",
      },
    }),
  },
  {
    url: "https://www.govinfo.gov/content/pkg/CREC-2026-01-20/txt/CREC-2026-01-20-pt1-PgD1.txt",
    contentType: "text/plain; charset=utf-8",
    body: digestText,
  },
  {
    url: "https://api.govinfo.gov/published/2026-01-06/2026-01-20?collection=CREC&offsetMark=*&pageSize=8",
    contentType: "application/json",
    body: json({
      packages: [
        {
          packageId: "CREC-2026-01-17",
          title: "Congressional Record",
          dateIssued: "2026-01-17",
          docClass: "CREC",
        },
      ],
    }),
  },
  {
    url: "https://api.govinfo.gov/packages/CREC-2026-01-17/granules?offsetMark=*&pageSize=120",
    contentType: "application/json",
    body: json({
      count: 1,
      granules: [
        {
          granuleId: "CREC-2026-01-17-pt1-PgS123",
          title: "Senate - Border Infrastructure Modernization Act",
          granuleClass: "Senate",
        },
      ],
    }),
  },
  {
    url: "https://api.govinfo.gov/packages/CREC-2026-01-17/granules/CREC-2026-01-17-pt1-PgS123/summary",
    contentType: "application/json",
    body: json({
      title: "Senate - Border Infrastructure Modernization Act",
      granuleId: "CREC-2026-01-17-pt1-PgS123",
      dateIssued: "2026-01-17",
      packageId: "CREC-2026-01-17",
      granuleClass: "Senate",
      members: [
        { bioGuideId: "C001098", memberName: "Mr. Cruz", chamber: "Senate", state: "TX", party: "R" },
      ],
      download: {
        txtLink: "https://www.govinfo.gov/content/pkg/CREC-2026-01-17/txt/CREC-2026-01-17-pt1-PgS123.txt",
      },
    }),
  },
  {
    url: "https://www.govinfo.gov/content/pkg/CREC-2026-01-17/txt/CREC-2026-01-17-pt1-PgS123.txt",
    contentType: "text/plain; charset=utf-8",
    body: granuleText,
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/210?format=json",
    contentType: "application/json",
    body: json({
      bill: {
        congress: 119,
        type: "S",
        number: "210",
        title: "Clean Transit Access Act",
        url: "https://www.congress.gov/bill/119th-congress/senate-bill/210",
        introducedDate: "2026-01-15",
        latestAction: { actionDate: "2026-01-15", text: "Passed Senate" },
        policyArea: { name: "Transportation" },
        sponsors: [{ bioguideId: "S000148", party: "Democratic" }],
      },
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/210/summaries?format=json",
    contentType: "application/json",
    body: json({
      summaries: [
        {
          updateDate: "2026-01-15",
          text: "Provides grants to modernize public transit fleets with zero-emission vehicles.",
        },
      ],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/210/subjects?format=json",
    contentType: "application/json",
    body: json({
      subjects: [{ name: "Public transit" }, { name: "Emissions" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/210/committees?format=json",
    contentType: "application/json",
    body: json({
      committees: [{ name: "Committee on Banking, Housing, and Urban Affairs", chamber: "Senate" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/210/cosponsors?format=json",
    contentType: "application/json",
    body: json({
      cosponsors: [{ bioguideId: "G000555", party: "Democratic" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/210/actions?format=json",
    contentType: "application/json",
    body: json({
      actions: [{ actionDate: "2026-01-15", text: "Passed Senate" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/198?format=json",
    contentType: "application/json",
    body: json({
      bill: {
        congress: 119,
        type: "S",
        number: "198",
        title: "Veterans Housing Stability Act",
        url: "https://www.congress.gov/bill/119th-congress/senate-bill/198",
        introducedDate: "2026-01-15",
        latestAction: { actionDate: "2026-01-15", text: "Cloture invoked in Senate" },
        policyArea: { name: "Armed forces and national security" },
        sponsors: [{ bioguideId: "G000555", party: "Democratic" }],
      },
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/198/summaries?format=json",
    contentType: "application/json",
    body: json({
      summaries: [
        {
          updateDate: "2026-01-15",
          text: "Expands housing assistance and rental vouchers for veterans at risk of homelessness.",
        },
      ],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/198/subjects?format=json",
    contentType: "application/json",
    body: json({
      subjects: [{ name: "Veterans" }, { name: "Housing" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/198/committees?format=json",
    contentType: "application/json",
    body: json({
      committees: [{ name: "Committee on Veterans' Affairs", chamber: "Senate" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/198/cosponsors?format=json",
    contentType: "application/json",
    body: json({
      cosponsors: [{ bioguideId: "S000148", party: "Democratic" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/198/actions?format=json",
    contentType: "application/json",
    body: json({
      actions: [{ actionDate: "2026-01-15", text: "Cloture invoked in Senate" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/303?format=json",
    contentType: "application/json",
    body: json({
      bill: {
        congress: 119,
        type: "S",
        number: "303",
        title: "Border Infrastructure Modernization Act",
        url: "https://www.congress.gov/bill/119th-congress/senate-bill/303",
        introducedDate: "2026-01-17",
        latestAction: { actionDate: "2026-01-17", text: "Passed Senate" },
        policyArea: { name: "Immigration" },
        sponsors: [{ bioguideId: "C001098", party: "Republican" }],
      },
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/303/summaries?format=json",
    contentType: "application/json",
    body: json({
      summaries: [
        {
          updateDate: "2026-01-17",
          text: "Funds upgrades to ports of entry along the southern and northern borders.",
        },
      ],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/303/subjects?format=json",
    contentType: "application/json",
    body: json({
      subjects: [{ name: "Border security" }, { name: "Infrastructure" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/303/committees?format=json",
    contentType: "application/json",
    body: json({
      committees: [{ name: "Committee on Homeland Security and Governmental Affairs", chamber: "Senate" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/303/cosponsors?format=json",
    contentType: "application/json",
    body: json({
      cosponsors: [{ bioguideId: "C001056", party: "Republican" }],
    }),
  },
  {
    url: "https://api.congress.gov/v3/bill/119/s/303/actions?format=json",
    contentType: "application/json",
    body: json({
      actions: [{ actionDate: "2026-01-17", text: "Passed Senate" }],
    }),
  },
];
