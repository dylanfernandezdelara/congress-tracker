import { expect, test } from '@playwright/test'

const harnessNow = process.env.HARNESS_NOW ?? '2026-01-20T15:00:00Z'
const expectedTitle =
  process.env.HARNESS_EXPECTED_VOTE_TITLE ?? 'Border Infrastructure Modernization Act'

test('renders the live briefing from the deterministic harness API and opens the vote detail', async ({
  page,
}) => {
  await page.goto(`/?harness_now=${encodeURIComponent(harnessNow)}`)

  await expect(page.getByText('No current briefing to promote')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: new RegExp(expectedTitle, 'i') })).toBeVisible()
  await expect(page.getByText(/Washington,\s*D\.C\./)).toBeVisible()

  await page.getByRole('link', { name: new RegExp(expectedTitle, 'i') }).click()

  await expect(page).toHaveURL(/\/votes\/119\/2\/14$/)
  await expect(page.getByRole('heading', { name: new RegExp(expectedTitle, 'i') })).toBeVisible()
  await expect(page.getByText(/On Passage of the Bill/i)).toBeVisible()
})
