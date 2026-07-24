import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  /** Override for tests; defaults to a full page reload. */
  onReload?: () => void
}

type ErrorBoundaryState = {
  hasError: boolean
}

/**
 * Catches render errors in the page outlet so the site chrome (header/nav)
 * stays usable. Reload recovers from transient crash state.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack)
  }

  private handleReload = (): void => {
    if (this.props.onReload) {
      this.props.onReload()
      return
    }
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-border bg-card px-4 py-8" role="alert">
          <p className="text-sm text-secondary">Something went wrong loading this page.</p>
          <button type="button" className="ghost-button mt-4" onClick={this.handleReload}>
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
