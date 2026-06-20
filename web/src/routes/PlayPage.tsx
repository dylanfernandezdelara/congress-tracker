import { GameRevealPanel } from '../components/GameRevealPanel'
import { useGameSession, type GameMode } from '../hooks/useGameSession'
import { getRevealAction, getRevealActionLabel } from '../utils/gameUi'

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
        60s
      </button>
    </div>
  )
}

function GameGuessButtons({
  disabled,
  onGuess,
  className = '',
}: {
  disabled: boolean
  onGuess: (answer: 'passed' | 'failed') => void
  className?: string
}) {
  return (
    <div className={`game-guess-actions${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="game-guess-button game-guess-button--pass"
        disabled={disabled}
        onClick={() => onGuess('passed')}
      >
        Passed
      </button>
      <button
        type="button"
        className="game-guess-button game-guess-button--fail"
        disabled={disabled}
        onClick={() => onGuess('failed')}
      >
        Failed
      </button>
    </div>
  )
}

function GameSkeleton() {
  return <div className="game-card game-card-skeleton" aria-hidden="true" />
}

export default function PlayPage() {
  const game = useGameSession()
  const showPrompt = game.phase === 'playing' || game.phase === 'reveal'
  const canGuess = game.phase === 'playing' && game.currentRound
  const revealAction = getRevealAction(game.phase, game.mode, game.wasCorrect)
  const showTimedWrongNote = game.phase === 'reveal' && game.mode === 'timed' && game.wasCorrect === false

  const handleRevealAction = () => {
    if (revealAction === 'restart') {
      game.restart()
      return
    }
    game.nextRound()
  }

  return (
    <main className={`game-page game-page--${game.phase}`}>
      <header className="game-page-header">
        <div className="game-page-intro">
          <h1 className="game-page-title">Pass or Fail?</h1>
          <p className="game-page-subtitle">
            Guess from the snippet alone, then see the vote.
          </p>
        </div>
        <div className="game-toolbar">
          <ModeToggle
            mode={game.mode}
            disabled={game.phase === 'playing' || game.phase === 'reveal'}
            onChange={game.setMode}
          />
          <p className="game-status" aria-live="polite">
            {game.statusLabel}
          </p>
        </div>
      </header>

      {game.phase === 'loading' ? <GameSkeleton /> : null}

      {showPrompt && game.currentRound ? (
        <article className="game-card" aria-label="Current bill round">
          <p className="game-card-kicker">Blind round</p>
          <h2 className="game-card-headline">{game.currentRound.prompt.headline}</h2>
          <p className="game-card-snippet">{game.currentRound.prompt.snippet}</p>

          {canGuess ? (
            <GameGuessButtons
              className="game-guess-actions--inline"
              disabled={false}
              onGuess={(answer) => void game.guess(answer)}
            />
          ) : null}

          {game.phase === 'reveal' && game.reveal && game.lastGuess !== null && game.wasCorrect !== null ? (
            <>
              <GameRevealPanel
                reveal={game.reveal}
                guess={game.lastGuess}
                wasCorrect={game.wasCorrect}
              />
              {showTimedWrongNote ? (
                <p className="game-reveal-note">Wrong guesses do not end the sprint — keep going.</p>
              ) : null}
              {revealAction ? (
                <button
                  type="button"
                  className="game-next-button game-next-button--inline"
                  onClick={handleRevealAction}
                >
                  {getRevealActionLabel(revealAction)}
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
          <button type="button" className="game-next-button game-next-button--inline" onClick={game.restart}>
            Play again
          </button>
        </section>
      ) : null}

      {canGuess ? (
        <div className="game-dock" role="toolbar" aria-label="Your guess">
          <GameGuessButtons disabled={false} onGuess={(answer) => void game.guess(answer)} />
        </div>
      ) : null}

      {revealAction ? (
        <div className="game-dock game-dock--cta">
          <button type="button" className="game-next-button" onClick={handleRevealAction}>
            {getRevealActionLabel(revealAction)}
          </button>
        </div>
      ) : null}

      {game.phase === 'finished' ? (
        <div className="game-dock game-dock--cta">
          <button type="button" className="game-next-button" onClick={game.restart}>
            Play again
          </button>
        </div>
      ) : null}
    </main>
  )
}
