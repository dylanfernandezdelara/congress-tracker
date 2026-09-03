#!/usr/bin/env node
/**
 * Viewport QA for the web UI.
 *
 * Run with the dev server up: npm run dev:web
 * Usage: npm run qa:web
 * Env: QA_WEB_URL (default http://127.0.0.1:5173), QA_WEB_OUT_DIR (default artifacts/qa-viewports)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.QA_WEB_URL ?? 'http://127.0.0.1:5173'
const outDir = path.resolve(rootDir, process.env.QA_WEB_OUT_DIR ?? 'artifacts/qa-viewports')

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1'

const VIEWPORTS = [
  { id: 'mobile-narrow', width: 320, height: 568, label: 'iPhone SE', mobile: true },
  { id: 'mobile', width: 390, height: 844, label: 'iPhone 14', mobile: true },
  { id: 'desktop', width: 1280, height: 800, label: 'Desktop', mobile: false },
  { id: 'desktop-wide', width: 1440, height: 900, label: 'Desktop wide', mobile: false },
]

const THEMES = ['light', 'dark']

const LONG_DIGEST_LEAD =
  'This bill blocks federal aid for students enrolled at institutions with no physical campus.'
const LONG_DIGEST = `${LONG_DIGEST_LEAD} ${'It also adds reporting requirements. '.repeat(8)}`.trim()

const MOCK_FEED = {
  items: [
    {
      bill: { congress: 119, type: 'S', number: 2, title: 'Sample Act' },
      policy_area: 'Defense',
      digest: {
        headline: 'Plain headline for readers',
        what_it_does: LONG_DIGEST,
        key_points: [
          'Blocks aid for ghost enrollments',
          'Requires campus verification',
          'Adds annual reporting rules',
        ],
        terms_explained: [],
      },
      raw_summary_text: `${'Official CRS summary text. '.repeat(40)}`.trim(),
      passage_votes: [
        {
          chamber: 'Senate',
          question: 'On Passage of the Bill',
          result: 'Passed',
          yeas: 52,
          nays: 47,
          date: '2026-06-05',
        },
      ],
      latest_passage_date: '2026-06-05',
      latest_activity_date: '2026-06-05',
      text_changes: {
        summary_version: 'Introduced',
        summary_version_date: '2026-06-01',
        latest_version: 'Engrossed',
        latest_version_date: '2026-06-04',
        added_provisions: [{ label: 'Sec. 4.', heading: 'Public spending dashboard details' }],
        more_added_count: 0,
      },
    },
  ],
  total: 1,
  limit: 50,
  offset: 0,
  has_more: false,
}

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {
    throw new Error(
      'Playwright is required for viewport QA. Run: npm install && npx playwright install chromium',
    )
  }
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Dev server not reachable at ${url}. Start it with: npm run dev:web`)
}

async function auditHomePage(page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const heading = document.querySelector('h1')
    const membersSidebar = document.querySelector('[aria-label="Members in Congress"]')
    const feedRow = document.querySelector('#feed-top .feed-row')
    const topic = document.querySelector('#feed-top [data-feed-topic]')
    const policyArea = document.querySelector('#feed-top [data-feed-policy-area]')
    const eventLine = document.querySelector('#feed-top .feed-row-event:not([hidden])')
    const summary = document.querySelector('#feed-top [data-feed-summary]')
    const issues = []

    const collectHorizontalClipping = (rect, label) => {
      if (rect.left < -0.5) issues.push(`${label} clipped on the left`)
      if (rect.right > viewportWidth + 0.5) issues.push(`${label} clipped on the right`)
      if (rect.width <= 0 || rect.height <= 0) issues.push(`${label} not visible`)
    }

    const collectFullClipping = (rect, label) => {
      collectHorizontalClipping(rect, label)
      if (rect.top < -0.5) issues.push(`${label} clipped on the top`)
      if (rect.bottom > viewportHeight + 0.5) issues.push(`${label} clipped on the bottom`)
    }

    if (!heading) issues.push('page heading missing')
    if (heading && heading.textContent?.trim() !== 'Track Congress') {
      issues.push('page heading should read Track Congress')
    }
    // Below the desktop rail breakpoint, Home stacks former rail content under the feed
    // (.home-mobile-rails). Desktop keeps sticky .home-rail columns instead.
    const collectTightnessBars = (root, prefix) => {
      if (!root) return
      if (root.querySelector('.tightness-scale-label') || /50%\s*yea/.test(root.textContent || '')) {
        issues.push(`${prefix} 50%–100% scale chrome still present`)
      }
      for (const row of root.querySelectorAll('[data-tightness-row]')) {
        const rowName = row.getAttribute('data-tightness-row') || 'row'
        const list = row.querySelector('.tightness-bars')
        if (!list) {
          issues.push(`${prefix} ${rowName} tightness bars missing`)
          continue
        }
        const buttons = [...row.querySelectorAll('.tightness-bar-row')]
        const limit = rowName === 'house' ? 4 : 3 // HOUSE_CLOSEST_LIMIT / SENATE_CLOSEST_LIMIT
        if (buttons.length > limit) {
          issues.push(`${prefix} ${rowName} tightness bars exceed ${limit}`)
        }
        if (buttons.length === 0 && !row.querySelector('.tightness-empty')) {
          issues.push(`${prefix} ${rowName} tightness bars empty without a fallback`)
        }
        for (const button of buttons) {
          const label = button.querySelector('.tightness-bar-label')
          const track = button.querySelector('.tightness-bar-track')
          const fill = button.querySelector('.tightness-bar-fill')
          const text = label?.textContent ?? ''
          if (!text.trim()) {
            issues.push(`${prefix} ${rowName} tightness bar label missing`)
          }
          if (text.includes('421–1') || text.includes('421-1')) {
            issues.push(`${prefix} steamroll 421–1 appeared in tightness bars`)
          }
          if (!track || !fill) {
            issues.push(`${prefix} ${rowName} tightness bar track missing`)
            continue
          }
          const buttonRect = button.getBoundingClientRect()
          const trackRect = track.getBoundingClientRect()
          const fillRect = fill.getBoundingClientRect()
          collectHorizontalClipping(buttonRect, `${prefix} ${rowName} tightness bar`)
          if (buttonRect.height < 27) {
            issues.push(`${prefix} ${rowName} tightness bar tap target is shorter than 28px`)
          }
          if (fillRect.height < 6 || fillRect.height > 10) {
            issues.push(`${prefix} ${rowName} tightness bar is not 8px tall`)
          }
          if (Math.abs(fillRect.left - trackRect.left) > 1) {
            issues.push(`${prefix} ${rowName} tightness bar is x-shifted`)
          }
          if (fillRect.width > trackRect.width + 1) {
            issues.push(`${prefix} ${rowName} tightness bar escaped the track`)
          }
        }
      }
    }

    if (viewportWidth < 1024) {
      const mobileRails = document.querySelector('.home-mobile-rails')
      if (!mobileRails) {
        issues.push('mobile rail stack missing on feed page below desktop breakpoint')
      } else {
        const railsRect = mobileRails.getBoundingClientRect()
        if (railsRect.width <= 0 || railsRect.height <= 0) {
          issues.push('mobile rail stack not laid out on feed page below desktop breakpoint')
        }
      }
      if (!membersSidebar) {
        issues.push('members section missing on feed page below desktop breakpoint')
      }
      if (document.querySelector('.home-rail--left, .home-rail--right')) {
        issues.push('desktop rails mounted on feed page below desktop breakpoint')
      }
      if (document.querySelector('.home-rail--right')) {
        issues.push('right rail mounted on mobile')
      }
      const tightnessMobile = document.querySelector('.home-tightness-mobile')
      if (!tightnessMobile) {
        issues.push('mobile tightness stack missing under the timeline')
      } else {
        collectHorizontalClipping(tightnessMobile.getBoundingClientRect(), 'mobile vote tightness')
        const houseRow = tightnessMobile.querySelector('[data-tightness-row="house"]')
        const senateRow = tightnessMobile.querySelector('[data-tightness-row="senate"]')
        if (!houseRow) issues.push('House tightness row missing on mobile')
        if (!senateRow) issues.push('Senate tightness row missing on mobile')
        if (houseRow) collectHorizontalClipping(houseRow.getBoundingClientRect(), 'House tightness row')
        if (senateRow) collectHorizontalClipping(senateRow.getBoundingClientRect(), 'Senate tightness row')
        collectTightnessBars(tightnessMobile, 'mobile')
      }
      const senateWaiting = document.querySelector(
        '.home-feed-secondary [aria-label="House-passed, sitting in the Senate"]',
      )
      if (!senateWaiting) {
        issues.push('Senate-waiting list missing in the mobile secondary stack')
      } else {
        collectHorizontalClipping(senateWaiting.getBoundingClientRect(), 'Senate-waiting list')
      }
    } else {
      if (!membersSidebar) {
        issues.push('members section missing on feed page at desktop breakpoint')
      }
      if (!document.querySelector('.home-rail--right')) {
        issues.push('desktop right rail missing')
      }
      const tightnessRail = document.querySelector('.home-rail--right [aria-label="Vote tightness"]')
      if (!tightnessRail) {
        issues.push('vote tightness missing on desktop right rail')
      } else {
        const houseRow = tightnessRail.querySelector('[data-tightness-row="house"]')
        const senateRow = tightnessRail.querySelector('[data-tightness-row="senate"]')
        if (!houseRow) issues.push('House tightness row missing on desktop')
        if (!senateRow) issues.push('Senate tightness row missing on desktop')
        if (houseRow) collectHorizontalClipping(houseRow.getBoundingClientRect(), 'House tightness row')
        if (senateRow) collectHorizontalClipping(senateRow.getBoundingClientRect(), 'Senate tightness row')
        collectTightnessBars(tightnessRail, 'desktop')
      }
    }
    if (!feedRow) issues.push('feed row missing')
    if (!document.querySelector('.feed-row-chip--text-grew')) {
      issues.push('Text grew mark missing on a feed row with added_provisions')
    }

    if (heading) collectFullClipping(heading.getBoundingClientRect(), 'page heading')

    if (feedRow) {
      const rowRect = feedRow.getBoundingClientRect()
      collectHorizontalClipping(rowRect, 'feed row')
      if (rowRect.bottom <= 0 || rowRect.top >= viewportHeight) {
        issues.push('feed row not visible in viewport')
      }
      // The collapsed row height is content-driven; mobile summary height is capped by word limits.
    }

    const isCssLineClamped = (element) => {
      const style = window.getComputedStyle(element)
      const clamp = style.webkitLineClamp || style.getPropertyValue('-webkit-line-clamp')
      return Boolean(clamp && clamp !== 'none' && clamp !== 'unset' && Number(clamp) > 0)
    }

    if (topic) {
      collectHorizontalClipping(topic.getBoundingClientRect(), 'feed topic')
    } else {
      issues.push('feed topic missing')
    }

    if (eventLine) {
      const eventRect = eventLine.getBoundingClientRect()
      collectHorizontalClipping(eventRect, 'feed event line')
      if (eventRect.bottom <= 0 || eventRect.top >= viewportHeight) {
        issues.push('feed event line not visible in viewport')
      }
    } else {
      const marginChip = document.querySelector('#feed-top .feed-row-chip--margin')
      if (marginChip) {
        collectHorizontalClipping(marginChip.getBoundingClientRect(), 'feed vote margin')
      } else {
        issues.push('feed event line or vote margin missing')
      }
    }

    if (policyArea) {
      collectHorizontalClipping(policyArea.getBoundingClientRect(), 'feed policy area')
      if (viewportWidth < 640) {
        const policyRect = policyArea.getBoundingClientRect()
        if (policyRect.bottom <= 0 || policyRect.top >= viewportHeight) {
          issues.push('feed policy area not visible on mobile')
        }
      }
    }

    if (summary) {
      collectHorizontalClipping(summary.getBoundingClientRect(), 'feed summary')

      // Collapsed summaries are capped at ~25 words + a few bullets — guard mobile height.
      if (viewportWidth < 640) {
        const summaryRect = summary.getBoundingClientRect()
        if (summaryRect.height > viewportHeight * 0.45) {
          issues.push('feed summary taller than 45% of viewport on mobile')
        }
      }
    } else {
      issues.push('feed summary missing')
    }

    // Length for topic/teaser/bullets is owned in JS — CSS must not line-clamp them.
    const clampTargets = [
      ['feed topic', topic],
      ['feed teaser', summary?.querySelector('.feed-row-teaser')],
      ['feed summary bullets', summary?.querySelector('.feed-row-summary-bullets')],
    ]
    for (const [label, element] of clampTargets) {
      if (!element) continue
      if (isCssLineClamped(element)) {
        issues.push(`${label} is line-clamped (JS owns length; CSS must not truncate)`)
      }
    }

    return {
      issues,
      theme: document.documentElement.dataset.theme ?? 'light',
    }
  })
}

const MOCK_SESSION_STATS = {
  congress: 119,
  session: 2,
  as_of: '2026-06-14T00:00:00.000Z',
  house: {
    passage_vote_count: 2,
    unique_bills_passed: 2,
    avg_margin: 12,
    closest_margin: 5,
    date_range: { first: '2026-06-01', last: '2026-06-05' },
    coverage_days: 5,
  },
  senate: {
    passage_vote_count: 1,
    unique_bills_passed: 1,
    avg_margin: 5,
    closest_margin: 5,
    date_range: { first: '2026-06-05', last: '2026-06-05' },
    coverage_days: 1,
  },
  composition: {
    house: {
      seats: [
        { party: 'R', seats: 220 },
        { party: 'D', seats: 215 },
      ],
      total: 435,
      majority_party: 'R',
      control_label: 'Republican control',
      seats_up_for_election: 435,
      election_year: 2026,
    },
    senate: {
      seats: [
        { party: 'R', seats: 53 },
        { party: 'D', seats: 47 },
      ],
      total: 100,
      majority_party: 'R',
      control_label: 'Republican control',
      seats_up_for_election: 33,
      election_year: 2026,
    },
  },
}

const MOCK_NOTABLE_VOTES = {
  congress: 119,
  session: 2,
  detection_method: 'heuristic',
  as_of: '2026-06-14T00:00:00.000Z',
  notable: [],
}

function extraTightnessDots(base, percents, rollStart) {
  return percents.map((yea_pct, index) => {
    const total = 420
    const yeas = Math.round(yea_pct * total)
    return {
      ...base,
      roll_number: rollStart + index,
      bill_number: (base.bill_number ?? 100) + index + 1,
      yeas,
      nays: total - yeas,
      yea_pct,
      cohesion: yea_pct > 0.9 ? 'bipartisan' : 'party-line',
      headline: `${base.chamber} sample roll ${rollStart + index}`,
    }
  })
}

const MOCK_TIGHTNESS_HOUSE_KNIFE = {
  kind: 'bill',
  chamber: 'House',
  congress: 119,
  session: 2,
  roll_number: 9010,
  vote_date: '2026-06-05',
  yeas: 210,
  nays: 208,
  result: 'Passed',
  yea_pct: 210 / 418,
  cohesion: 'party-line',
  party_splits: [
    { party: 'R', yeas: 207, nays: 5, party_line: 'yea' },
    { party: 'D', yeas: 2, nays: 203, party_line: 'nay' },
  ],
  member_votes_available: true,
  bill_type: 'HR',
  bill_number: 88,
  headline: 'House passes a knife-edge resolution',
  nominee_name: null,
  position_title: null,
}

const MOCK_TIGHTNESS = {
  congress: 119,
  session: 2,
  as_of: '2026-06-14T00:00:00.000Z',
  house_passage: [
    MOCK_TIGHTNESS_HOUSE_KNIFE,
    {
      ...MOCK_TIGHTNESS_HOUSE_KNIFE,
      roll_number: 9013,
      bill_number: 99,
      yeas: 212,
      nays: 206,
      result: 'Failed',
      yea_pct: 212 / 418,
      vote_date: '2026-06-03',
      headline: 'House fails a close spending rule',
    },
    {
      kind: 'bill',
      chamber: 'House',
      congress: 119,
      session: 2,
      roll_number: 9012,
      vote_date: '2026-06-04',
      yeas: 421,
      nays: 1,
      result: 'Passed',
      yea_pct: 421 / 422,
      cohesion: 'bipartisan',
      party_splits: [
        { party: 'R', yeas: 218, nays: 0, party_line: 'yea' },
        { party: 'D', yeas: 203, nays: 1, party_line: 'yea' },
      ],
      member_votes_available: true,
      bill_type: 'HR',
      bill_number: 33,
      headline: 'House-passed contracting bill waiting in the Senate',
      nominee_name: null,
      position_title: null,
    },
    ...extraTightnessDots(
      MOCK_TIGHTNESS_HOUSE_KNIFE,
      [0.5023, 0.5024, 0.5035, 0.5047, 0.5071, 0.5072, 0.5176, 0.5203, 0.5277, 0.534, 0.5395, 0.5524],
      9100,
    ),
    ...extraTightnessDots(MOCK_TIGHTNESS_HOUSE_KNIFE, [0.9742, 0.9792, 0.985, 0.9952, 0.9976], 9200),
  ],
  senate: [
    {
      kind: 'nominee',
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9101,
      vote_date: '2026-06-12',
      yeas: 58,
      nays: 40,
      result: 'Confirmed',
      yea_pct: 58 / 98,
      cohesion: 'party-line',
      party_splits: [
        { party: 'R', yeas: 53, nays: 0, party_line: 'yea' },
        { party: 'D', yeas: 5, nays: 40, party_line: 'nay' },
      ],
      member_votes_available: true,
      bill_type: null,
      bill_number: null,
      headline: 'Jane Doe confirmed as Energy Secretary',
      nominee_name: 'Jane Doe',
      position_title: 'Secretary of Energy',
    },
    {
      kind: 'bill',
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 9002,
      vote_date: '2026-06-05',
      yeas: 68,
      nays: 32,
      result: 'Passed',
      yea_pct: 68 / 100,
      cohesion: 'bipartisan',
      party_splits: [
        { party: 'R', yeas: 40, nays: 10, party_line: 'yea' },
        { party: 'D', yeas: 28, nays: 22, party_line: 'yea' },
      ],
      member_votes_available: true,
      bill_type: 'S',
      bill_number: 2,
      headline: 'Plain headline for readers',
      nominee_name: null,
      position_title: null,
    },
    ...extraTightnessDots(
      {
        kind: 'nominee',
        chamber: 'Senate',
        congress: 119,
        session: 2,
        roll_number: 9300,
        vote_date: '2026-06-12',
        yeas: 51,
        nays: 49,
        result: 'Confirmed',
        yea_pct: 0.51,
        cohesion: 'party-line',
        party_splits: [
          { party: 'R', yeas: 53, nays: 0, party_line: 'yea' },
          { party: 'D', yeas: 5, nays: 40, party_line: 'nay' },
        ],
        member_votes_available: true,
        bill_type: null,
        bill_number: null,
        headline: 'Senate sample confirmation',
        nominee_name: 'Sample Nominee',
        position_title: 'Sample post',
      },
      [0.5051, 0.5053, 0.5102, 0.5155, 0.5158, 0.5204, 0.5269, 0.5368],
      9300,
    ),
  ],
  senate_waiting: [
    {
      congress: 119,
      bill_type: 'HR',
      bill_number: 33,
      headline: 'House-passed contracting bill waiting in the Senate',
      title: 'Federal Contracting Sunshine Act',
      senate_committee: 'Health, Education, Labor, and Pensions Committee',
      current_label: 'In Health, Education, Labor, and Pensions Committee · waiting for the committee to act',
      house_passage_date: '2026-06-04',
      text_grew: false,
    },
  ],
}

const MOCK_PULSE_STATS = {
  congress: 119,
  session: 2,
  as_of: '2026-06-14T00:00:00.000Z',
  house: {
    close_votes: [],
    policy_heat: [{ policy_area: 'Defense', bill_count: 1 }],
    this_week: { count: 1, headline: 'This week sample headline', bill_type: 's', bill_number: 2, congress: 119 },
    waiting_in_committee: [
      {
        system_code: 'hsif00',
        name: 'Energy and Commerce Committee',
        chamber: 'House',
        waiting: 2,
      },
    ],
  },
  senate: {
    close_votes: [],
    policy_heat: [],
    this_week: { count: 0, headline: null, bill_type: null, bill_number: null, congress: null },
    waiting_in_committee: [
      {
        system_code: 'sshr00',
        name: 'HELP Committee',
        chamber: 'Senate',
        waiting: 1,
      },
    ],
  },
}

const MOCK_DEFECTORS = {
  chamber: 'House',
  congress: 119,
  session: 2,
  defectors: [],
  as_of: '2026-06-14T00:00:00.000Z',
}

const MOCK_PORTFOLIOS = {
  chamber: 'House',
  congress: 119,
  session: 2,
  gainers: [],
  losers: [],
  disclaimer: 'Estimates from public disclosures.',
  as_of: '2026-06-14T00:00:00.000Z',
}

const MOCK_RECENT_CONFIRMATIONS = {
  congress: 119,
  session: 2,
  as_of: '2026-06-14T00:00:00.000Z',
  confirmations: [
    {
      chamber: 'Senate',
      congress: 119,
      session: 2,
      roll_number: 165,
      citation: 'PN100',
      nomination_number: 100,
      part_number: 0,
      nominee_names: [{ display_name: 'Jane Doe', state: 'CA' }],
      position_title: 'Secretary of Energy',
      organization: 'Department of Energy',
      description: 'Jane Doe, of California, to be Secretary of Energy.',
      question: 'On the Nomination',
      result: 'Confirmed',
      yeas: 58,
      nays: 40,
      vote_date: '2026-06-12',
      headline: 'Jane Doe confirmed as Energy Secretary',
      what_was_confirmed: 'The Senate confirmed Jane Doe as Secretary of Energy.',
      background: 'Jane Doe of California was nominated to lead the Department of Energy.',
      key_points: ['Cabinet-level confirmation'],
      congress_gov_url: 'https://www.congress.gov/nomination/119th-congress/100',
    },
  ],
}

const MOCK_RECENT_LAWS = {
  congress: 119,
  session: 2,
  as_of: '2026-06-14T00:00:00.000Z',
  laws: [
    {
      congress: 119,
      bill_type: 'HR',
      bill_number: 1,
      title: 'Lower Energy Costs Act',
      policy_area: 'Energy',
      headline: 'Energy permitting package becomes law',
      became_law_date: '2026-06-12',
      law_kind: 'signed',
      public_law: '119-1',
      signed_date: '2026-06-12',
      presented_date: '2026-06-08',
      latest_action_date: '2026-06-12',
      latest_action_text: 'Became Public Law No: 119-1.',
      latest_passage_vote_date: '2026-06-05',
      item: MOCK_FEED.items[0] ?? null,
    },
    {
      congress: 119,
      bill_type: 'S',
      bill_number: 47,
      title: 'Public Lands Protection Act',
      policy_area: 'Public Lands and Natural Resources',
      headline: 'Public lands bill becomes law without signature',
      became_law_date: '2026-06-10',
      law_kind: 'law_unsigned',
      public_law: '119-2',
      signed_date: null,
      presented_date: '2026-05-28',
      latest_action_date: '2026-06-10',
      latest_action_text: 'Became Public Law No: 119-2 without signature.',
      latest_passage_vote_date: '2026-05-20',
      item: MOCK_FEED.items[0] ?? null,
    },
  ],
}

const MOCK_COMMITTEES = {
  congress: 119,
  session: 2,
  chamber: 'House',
  as_of: '2026-06-14T00:00:00.000Z',
  items: [
    {
      system_code: 'hsif00',
      name: 'Energy and Commerce Committee',
      chamber: 'House',
      waiting: 2,
    },
  ],
}

async function installApiMocks(page) {
  await page.route('**/feed/latest.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_FEED),
    })
  })

  await page.route('**/stats/session.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SESSION_STATS),
    })
  })

  await page.route('**/stats/notable.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_NOTABLE_VOTES),
    })
  })

  await page.route('**/stats/recent-laws.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RECENT_LAWS),
    })
  })

  await page.route('**/stats/recent-confirmations.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RECENT_CONFIRMATIONS),
    })
  })

  await page.route('**/stats/committees.json**', async (route) => {
    const url = new URL(route.request().url())
    const chamber = url.searchParams.get('chamber') === 'Senate' ? 'Senate' : 'House'
    const items =
      chamber === 'Senate'
        ? [
            {
              system_code: 'sshr00',
              name: 'HELP Committee',
              chamber: 'Senate',
              waiting: 1,
            },
          ]
        : MOCK_COMMITTEES.items
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...MOCK_COMMITTEES, chamber, items }),
    })
  })

  await page.route('**/stats/pulse.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PULSE_STATS),
    })
  })

  await page.route('**/stats/tightness.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TIGHTNESS),
    })
  })

  await page.route('**/stats/defectors.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_DEFECTORS),
    })
  })

  await page.route('**/stats/portfolios.json**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PORTFOLIOS),
    })
  })

  await page.route('https://fonts.googleapis.com/**', async (route) => route.abort())
  await page.route('https://fonts.gstatic.com/**', async (route) => route.abort())
}

async function main() {
  await waitForServer(baseUrl)

  const { chromium } = await loadPlaywright()
  fs.mkdirSync(outDir, { recursive: true })

  const results = []
  let failures = 0

  const browser = await chromium.launch()

  try {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const caseId = `${viewport.id}-${theme}`
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: viewport.width < 500 ? 2 : 1,
          isMobile: Boolean(viewport.mobile),
          hasTouch: Boolean(viewport.mobile),
          userAgent: viewport.mobile ? IPHONE_SAFARI_UA : undefined,
        })

        await installApiMocks(page)

        await page.addInitScript((selectedTheme) => {
          localStorage.setItem('theme', selectedTheme)
          document.documentElement.dataset.theme = selectedTheme
        }, theme)

        // Home
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
        await page.getByText('Plain headline for readers').waitFor({ timeout: 10_000 })
        await page.locator('#feed-top').scrollIntoViewIfNeeded()

        const homeAudit = await auditHomePage(page)
        if (homeAudit.theme !== theme) {
          homeAudit.issues.push(`expected ${theme} theme but got ${homeAudit.theme}`)
        }

        const homeScreenshotPath = path.join(outDir, `${caseId}.png`)
        await page.screenshot({ path: homeScreenshotPath, fullPage: false })

        const homePassed = homeAudit.issues.length === 0
        if (!homePassed) failures += 1
        results.push({
          id: caseId,
          route: 'home',
          viewport: viewport.label,
          theme,
          passed: homePassed,
          issues: homeAudit.issues,
          screenshot: path.relative(rootDir, homeScreenshotPath),
        })

        await page.close()
      }
    }
  } finally {
    await browser.close()
  }

  const summary = {
    checkedAt: new Date().toISOString(),
    baseUrl,
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    failed: failures,
    results,
  }

  const summaryPath = path.join(outDir, 'summary.json')
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)

  console.log(`Viewport QA: ${summary.passed}/${summary.total} passed`)
  for (const result of results) {
    const status = result.passed ? 'PASS' : 'FAIL'
    console.log(`  [${status}] ${result.viewport} / ${result.theme} / home`)
    if (!result.passed) {
      for (const issue of result.issues) {
        console.log(`         - ${issue}`)
      }
    }
  }
  console.log(`Artifacts: ${path.relative(rootDir, outDir)}/`)

  if (failures > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
