#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const scriptDir = path.dirname(new URL(import.meta.url).pathname)
const workerDir = path.resolve(scriptDir, '..')
const outputPath = path.join(workerDir, 'src', 'harness-fixtures.generated.ts')

const congressApiKey = process.env.CONGRESS_API_KEY
const govInfoApiKey = process.env.GOVINFO_API_KEY

if (!congressApiKey || !govInfoApiKey) {
  console.error('Set CONGRESS_API_KEY and GOVINFO_API_KEY before refreshing harness fixtures.')
  process.exit(1)
}

const requests = [
  ['https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml', 'application/xml'],
  ['https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00012.xml', 'application/xml'],
  ['https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00013.xml', 'application/xml'],
  ['https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00014.xml', 'application/xml'],
  ['https://www.senate.gov/legislative/schedule/floor_schedule.xml', 'application/xml'],
  ['https://www.senate.gov/general/committee_schedules/hearings.xml', 'application/xml'],
  [
    `https://api.congress.gov/v3/member/congress/119?format=json&currentMember=true&limit=250&offset=0&api_key=${encodeURIComponent(congressApiKey)}`,
    'application/json',
  ],
  [
    `https://api.govinfo.gov/published/2026-01-20/2026-01-20?collection=CREC&docClass=DIGEST&offsetMark=*&pageSize=10&api_key=${encodeURIComponent(govInfoApiKey)}`,
    'application/json',
  ],
]

const entries = []
for (const [url, contentType] of requests) {
  console.log(`Fetching ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`)
  }
  const body = await response.text()
  entries.push({ url, contentType, body })
}

const content = `import type { HarnessFixtureEntry } from "./harness-fixtures";

export const refreshedHarnessFixtures: HarnessFixtureEntry[] = ${JSON.stringify(entries, null, 2)};\n`

await fs.writeFile(outputPath, content)
console.log(`Wrote ${outputPath}`)
