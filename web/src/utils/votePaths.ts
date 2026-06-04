export function voteDetailPath(congress: number, session: number, voteNumber: number): string {
  return `/votes/${congress}/${session}/${voteNumber}`
}
