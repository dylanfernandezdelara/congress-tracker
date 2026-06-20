import type { GameMode, GamePhase } from '../hooks/useGameSession'

export type RevealAction = 'next' | 'restart'

export function getRevealAction(
  phase: GamePhase,
  mode: GameMode,
  wasCorrect: boolean | null,
): RevealAction | null {
  if (phase !== 'reveal' || wasCorrect === null) return null
  if (mode === 'streak' && !wasCorrect) return 'restart'
  return 'next'
}

export function getRevealActionLabel(action: RevealAction): string {
  return action === 'restart' ? 'Try again' : 'Next bill'
}
