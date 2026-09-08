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
  if (fs.existsSync(distDir)) return false
  fs.mkdirSync(distDir, { recursive: true })
  const dest = path.join(distDir, 'index.html')
  const source = path.join(repoRoot, 'web', 'index.html')
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, dest)
  } else {
    fs.writeFileSync(dest, FALLBACK_WEB_DIST_HTML)
  }
  return true
}
