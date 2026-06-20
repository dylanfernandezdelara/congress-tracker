import { GameRevealPanel } from '../components/GameRevealPanel'
import { useGameSession, type GameMode } from '../hooks/useGameSession'

function ModeToggle({
  mode,
  disabled,
  onChange,
}: {
  mode: GameMode
  disabled: boolean
  onChange: (mode: GameMode) => void
}) {
  return (
    <div className="game-mode-toggle" role="group" aria-label="Game mode">
      <button
        type="button"
        className={`game-mode-button${mode === 'streak' ? ' is-active' : ''}`}
        disabled={disabled}
        aria-pressed={mode === 'streak'}
        onClick={() => onChange('streak')}
      >
        Streak
      </button>
      <button
        type="button"
        className={`game-mode-button${mode === 'timed' ? ' is-active' : ''}`}
        disabled={disabled}
        aria-pressed={mode === 'timed'}
        onClick={() => onChange('timed')}
      >
        60s sprint
      </button>
    </div>
  )
}

function GameSkeleton() {
  return <div className="game-card game-card-skeleton" aria-hidden="true" />
}

export default function PlayPage() {
  const game = useGameSession()
  const isBusy = game.phase === 'loading' || game.phase === 'reveal'
  const showPrompt = game.phase === 'playing' || game.phase === 'reveal'
  const canGuess = game.phase === 'playing' && game.currentRound

  return (
    <main className="game-page">
      <header className="game-page-header">
        <div>
          <h1 className="game-page-title">Pass or Fail?</h1>
          <p className="game-page-subtitle">
            Read the bill snippet blind, guess whether Congress passed it, then see who voted which way.
          </p>
        </div>
        <ModeToggle mode={game.mode} disabled={game.phase === 'playing' || game.phase === 'reveal'} onChange={game.setMode} />
      </header>

      <p className="game-status" aria-live="polite">
        {game.statusLabel}
      </p>

      {game.phase === 'loading' ? <GameSkeleton /> : null}

      {showPrompt && game.currentRound ? (
        <article className="game-card">
          <p className="game-card-kicker">No spoilers until you guess</p>
          <h2 className="game-card-headline">{game.currentRound.prompt.headline}</h2>
          <p className="game-card-snippet">{game.currentRound.prompt.snippet}</p>

          <div className="game-guess-actions">
            <button
              type="button"
              className="game-guess-button game-guess-button--pass"
              disabled={!canGuess}
              onClick={() => void game.guess('passed')}
            >
              Passed
            </button>
            <button
              type="button"
              className="game-guess-button game-guess-button--fail"
              disabled={!canGuess}
              onClick={() => void game.guess('failed')}
            >
              Failed
            </button>
          </div>

          {game.phase === 'reveal' && game.reveal && game.lastGuess !== null && game.wasCorrect !== null ? (
            <>
              <GameRevealPanel
                reveal={game.reveal}
                guess={game.lastGuess}
                wasCorrect={game.wasCorrect}
              />
              {game.phase === 'reveal' && game.mode === 'timed' && !game.wasCorrect ? (
                <p className="game-reveal-note">Wrong guesses do not end the sprint — keep going.</p>
              ) : null}
              {game.phase === 'reveal' && (game.mode === 'timed' || game.wasCorrect) ? (
                <button type="button" className="game-next-button" onClick={game.nextRound}>
                  Next bill
                </button>
              ) : null}
              {game.phase === 'reveal' && game.mode === 'streak' && !game.wasCorrect ? (
                <button type="button" className="game-next-button" onClick={game.restart}>
                  Try again
                </button>
              ) : null}
            </>
          ) : null}
        </article>
      ) : null}

      {game.phase === 'finished' ? (
        <section className="game-summary" aria-live="polite">
          <h2 className="game-summary-title">
            {game.score > 0 ? 'Run complete' : 'No rounds available'}
          </h2>
          <p className="game-summary-copy">
            {game.error ??
              (game.mode === 'timed'
                ? `You nailed ${game.score} out of ${game.roundIndex + (game.wasCorrect ? 1 : 0)} guesses before time ran out.`
                : `You reached a streak of ${game.score} correct guess${game.score === 1 ? '' : 'es'}.`)}
          </p>
          <button type="button" className="game-next-button" onClick={game.restart} disabled={isBusy}>
            Play again
          </button>
        </section>
      ) : null}
    </main>
  )
}
