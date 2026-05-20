import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = {
  children: ReactNode
  /** Custom fallback renderer. Receives the caught error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** Called after React logs the error — useful for Sentry/reporting. */
  onError?: (error: Error, info: ErrorInfo) => void
}

type State = {
  error: Error | null
}

/**
 * React class-based error boundary.
 * Wrap route sections or heavy page trees to prevent a single component
 * crash from taking down the entire UI.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomePage />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={(err, reset) => <MyFallback error={err} onRetry={reset} />}>
 *     ...
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
    // Keep a console trace so the dev overlay can show the component stack.
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }

  reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    const { error } = this.state
    if (error !== null) {
      if (this.props.fallback) return this.props.fallback(error, this.reset)
      return <DefaultErrorFallback error={error} reset={this.reset} />
    }
    return this.props.children
  }
}

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-500/25 dark:bg-red-950/20">
        <AlertTriangle
          className="mx-auto mb-4 h-10 w-10 text-red-500 dark:text-red-400"
          strokeWidth={1.5}
          aria-hidden
        />
        <h2 className="mb-1 text-base font-semibold text-red-900 dark:text-red-100">
          Bir şeyler ters gitti
        </h2>
        <p className="mb-5 text-sm text-red-700 dark:text-red-300">
          {error.message || 'Sayfa yüklenemedi. Lütfen tekrar deneyin.'}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Tekrar Dene
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-5 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-500/30 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-950/30"
          >
            Sayfayı Yenile
          </button>
        </div>
      </div>
    </div>
  )
}
