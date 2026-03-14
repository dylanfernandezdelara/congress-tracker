import fs from 'node:fs/promises'
import path from 'node:path'

const rootDir = path.resolve(new URL('..', import.meta.url).pathname)
const assertDir = process.env.HARNESS_ASSERT_DIR ?? path.join(rootDir, 'target', 'harness', 'assertions')
const apiUrl = process.env.HARNESS_API_URL ?? 'http://127.0.0.1:8787'
const pipelineUrl = process.env.HARNESS_PIPELINE_URL ?? 'http://127.0.0.1:8788'
const expectedVoteId = process.env.HARNESS_EXPECTED_VOTE_ID ?? '119:2:14'
const expectedVoteNumber = process.env.HARNESS_EXPECTED_VOTE_NUMBER ?? '14'
const expectedVoteTitle = process.env.HARNESS_EXPECTED_VOTE_TITLE ?? 'Border Infrastructure Modernization Act'

async function fetchJson(url) {
  const response = await fetch(url)
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { response, text, json }
}

async function writeArtifact(name, value) {
  await fs.mkdir(assertDir, { recursive: true })
  const filePath = path.join(assertDir, name)
  await fs.writeFile(filePath, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  const health = await fetchJson(`${apiUrl}/health`)
  await writeArtifact('health.json', health.json ?? health.text)
  assert(health.response.ok, `API health failed (${health.response.status})`)
  assert(health.json?.status === 'ok', 'API health payload did not report ok')

  const pipelineStatus = await fetchJson(`${pipelineUrl}/__pipeline/status`)
  await writeArtifact('pipeline-status.json', pipelineStatus.json ?? pipelineStatus.text)
  assert(pipelineStatus.response.ok, `Pipeline status failed (${pipelineStatus.response.status})`)
  assert(pipelineStatus.json?.status === 'ok', 'Pipeline status payload did not report ok')

  const briefing = await fetchJson(`${apiUrl}/briefings/latest.json`)
  await writeArtifact('briefing-latest.json', briefing.json ?? briefing.text)
  assert(briefing.response.ok, `Briefing fetch failed (${briefing.response.status})`)
  assert(Array.isArray(briefing.json?.items), 'Briefing payload missing items array')
  assert(briefing.json.items.length > 0, 'Briefing payload was empty')
  assert(briefing.json.items[0]?.id === expectedVoteId, `Expected lead vote ${expectedVoteId}, got ${briefing.json.items[0]?.id ?? 'none'}`)

  const activities = await fetchJson(`${apiUrl}/activities/index.json`)
  await writeArtifact('activities-index.json', activities.json ?? activities.text)
  assert(activities.response.ok, `Activities fetch failed (${activities.response.status})`)
  assert(Array.isArray(activities.json?.activities), 'Activities payload missing activities array')
  assert(activities.json.activities.length > 0, 'Activities payload was empty')

  const detail = await fetchJson(`${apiUrl}/votes/119/2/${expectedVoteNumber}.json`)
  await writeArtifact(`vote-detail-${expectedVoteNumber}.json`, detail.json ?? detail.text)
  assert(detail.response.ok, `Vote detail fetch failed (${detail.response.status})`)
  assert(detail.json?.vote?.id === expectedVoteId, `Expected vote detail id ${expectedVoteId}, got ${detail.json?.vote?.id ?? 'none'}`)
  assert(
    `${detail.json?.vote?.title ?? ''}`.includes(expectedVoteTitle),
    `Expected vote detail title to include "${expectedVoteTitle}"`
  )
}

main().catch(async (error) => {
  await writeArtifact('assert-error.txt', error instanceof Error ? error.stack ?? error.message : String(error))
  console.error(error)
  process.exit(1)
})
