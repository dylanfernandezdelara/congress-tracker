/**
 * Ensures a Cloudflare Pages project exists (idempotent).
 * Used by CI and `npm run deploy:cloudflare:dev` so the first deploy does not fail
 * when the project has not been created in the dashboard yet.
 *
 * Requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Pages:Edit or broader).
 */

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const projectName = process.env.PAGES_PROJECT_NAME ?? 'daily-senate-update-dev';
const productionBranch = process.env.PAGES_PRODUCTION_BRANCH ?? 'main';

if (!accountId || !token) {
  console.error(
    'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN (required to manage Pages projects).',
  );
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;

async function main() {
  const listRes = await fetch(base, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listText = await listRes.text();
  if (!listRes.ok) {
    throw new Error(`List Pages projects failed: HTTP ${listRes.status} ${listText}`);
  }
  const listJson = JSON.parse(listText);
  if (!listJson.success) {
    throw new Error(`List Pages projects failed: ${JSON.stringify(listJson.errors)}`);
  }
  const exists = listJson.result?.some((p) => p.name === projectName);
  if (exists) {
    console.log(`Pages project "${projectName}" already exists.`);
    return;
  }

  const createRes = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      production_branch: productionBranch,
    }),
  });
  const createText = await createRes.text();
  if (!createRes.ok) {
    throw new Error(`Create Pages project failed: HTTP ${createRes.status} ${createText}`);
  }
  const createJson = JSON.parse(createText);
  if (!createJson.success) {
    throw new Error(`Create Pages project failed: ${JSON.stringify(createJson.errors)}`);
  }
  console.log(
    `Created Pages project "${projectName}" (production branch: ${productionBranch}).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
