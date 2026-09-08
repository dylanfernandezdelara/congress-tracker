import fs from 'node:fs'
import path from 'node:path'

export const FALLBACK_WEB_DIST_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Track Congress</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`

export function ensureWebDistPlaceholder(repoRoot) {
  if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
    throw new Error('repoRoot is required')
  }
  const distDir = path.join(repoRoot, 'web', 'dist')
  const dest = path.join(distDir, 'index.html')
  // Key on index.html, not the directory: an empty web/dist lets wrangler start
  // but serves nothing, so it is repaired the same way as a missing one.
  if (fs.existsSync(dest)) return false
  fs.mkdirSync(distDir, { recursive: true })
  const source = path.join(repoRoot, 'web', 'index.html')
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, dest)
  } else {
    fs.writeFileSync(dest, FALLBACK_WEB_DIST_HTML)
  }
  return true
}
