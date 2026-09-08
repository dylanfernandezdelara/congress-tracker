import fs from 'node:fs'

export function tailFile(filePath, lineCount) {
  if (typeof filePath !== 'string' || filePath.length === 0) return ''
  const n = Number(lineCount)
  if (!Number.isInteger(n) || n <= 0) return ''
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    if (text.length === 0) return ''
    const lines = text.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    return lines.slice(-n).join('\n')
  } catch {
    return ''
  }
}
