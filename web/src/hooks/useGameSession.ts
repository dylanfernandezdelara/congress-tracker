import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchGameReveal, fetchGameRounds } from '../api/client'
import type { GameRevealResponse, GameRound } from '../api/types'

export type GameMode = 'streak' | 'timed'

export type GamePhase = 'loading' | 'playing' | 'reveal' | 'finished'

const TIMED_SECONDS = 60
const ROUND_BATCH_SIZE = 20

export interface GameSessionState {
  mode: GameMode
  phase: GamePhase
  rounds: GameRound[]
  roundIndex: number
  streak: number
  score: number
  timedSecondsLeft: number
  reveal: GameRevealResponse | null
  lastGuess: 'passed' | 'failed' | null
  wasCorrect: boolean | null
  error: string | null
  statusLabel: string
  currentRound: GameRound | null
}

export interface GameSessionActions {
  setMode: (mode: GameMode) => void
  startGame: () => Promise<void>
  guess: (answer: 'passed' | 'failed') => Promise<void>
  nextRound: () => void
  restart: () => void
}

function initialTimedSeconds(mode: GameMode): number {
  return mode === 'timed' ? TIMED_SECONDS : 0
}

export function useGameSession(): GameSessionState & GameSessionActions {
  const [mode, setModeState] = useState<GameMode>('streak')
  const [phase, setPhase] = useState<GamePhase>('loading')
  const [rounds, setRounds] = useState<GameRound[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [streak, setStreak] = useState(0)
  const [score, setScore] = useState(0)
  const [timedSecondsLeft, setTimedSecondsLeft] = useState(initialTimedSeconds('streak'))
  const [reveal, setReveal] = useState<GameRevealResponse | null>(null)
  const [lastGuess, setLastGuess] = useState<'passed' | 'failed' | null>(null)
  const [wasCorrect, setWasCorrect] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const resetSession = useCallback(
    (nextMode: GameMode) => {
      clearTimer()
      setRoundIndex(0)
      setStreak(0)
      setScore(0)
      setReveal(null)
      setLastGuess(null)
      setWasCorrect(null)
      setError(null)
      setTimedSecondsLeft(initialTimedSeconds(nextMode))
    },
    [clearTimer],
  )

  const setMode = useCallback(
    (nextMode: GameMode) => {
      setModeState(nextMode)
      resetSession(nextMode)
      setPhase('loading')
    },
    [resetSession],
  )

  const startGame = useCallback(async () => {
    setPhase('loading')
    setError(null)
    resetSession(mode)

    try {
      const response = await fetchGameRounds(ROUND_BATCH_SIZE)
      if (response.rounds.length === 0) {
        setRounds([])
        setPhase('finished')
        setError('No playable rounds are available right now.')
        return
      }
      setRounds(response.rounds)
      setPhase('playing')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load game rounds.')
      setPhase('finished')
    }
  }, [mode, resetSession])

  useEffect(() => {
    void startGame()
  }, [startGame])

  useEffect(() => {
    if (mode !== 'timed' || phase !== 'playing') {
      clearTimer()
      return
    }

    timerRef.current = window.setInterval(() => {
      setTimedSecondsLeft((seconds) => {
        if (seconds <= 1) {
          clearTimer()
          setPhase('finished')
          return 0
        }
        return seconds - 1
      })
    }, 1000)

    return clearTimer
  }, [clearTimer, mode, phase])

  const currentRound = rounds[roundIndex] ?? null

  const guess = useCallback(
    async (answer: 'passed' | 'failed') => {
      if (phase !== 'playing' || !currentRound) return

      setPhase('reveal')
      setLastGuess(answer)

      try {
        const revealResponse = await fetchGameReveal(currentRound.id)
        const correct = revealResponse.correct === answer
        setReveal(revealResponse)
        setWasCorrect(correct)

        if (correct) {
          setScore((value) => value + 1)
          setStreak((value) => value + 1)
        } else {
          setStreak(0)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reveal this round.')
        setPhase('finished')
      }
    },
    [currentRound, mode, phase],
  )

  const nextRound = useCallback(() => {
    if (phase !== 'reveal') return

    const nextIndex = roundIndex + 1
    if (nextIndex >= rounds.length) {
      setPhase('finished')
      return
    }

    setRoundIndex(nextIndex)
    setReveal(null)
    setLastGuess(null)
    setWasCorrect(null)
    setPhase('playing')
  }, [phase, roundIndex, rounds.length])

  const restart = useCallback(() => {
    void startGame()
  }, [startGame])

  const statusLabel = useMemo(() => {
    if (mode === 'timed') return `${score} correct · ${timedSecondsLeft}s left`
    if (streak === 0) return 'Streak mode · tap Passed or Failed'
    return `Streak ${streak}`
  }, [mode, score, streak, timedSecondsLeft])

  return {
    mode,
    phase,
    rounds,
    roundIndex,
    streak,
    score,
    timedSecondsLeft,
    reveal,
    lastGuess,
    wasCorrect,
    error,
    statusLabel,
    currentRound,
    setMode,
    startGame,
    guess,
    nextRound,
    restart,
  }
}

export type GameSession = ReturnType<typeof useGameSession>
