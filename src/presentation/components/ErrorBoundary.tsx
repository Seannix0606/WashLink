import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface ErrorBoundaryProps {
  children: ReactNode
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)

    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-5 py-8 text-center sm:px-6">
          <div className="rounded-3xl border border-[var(--color-surface-muted)] bg-[var(--color-surface)] p-8 shadow-lg">
            <h1 className="text-2xl font-semibold text-[var(--color-ink-900)]">
              Something went wrong
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-ink-500)]">
              An unexpected error occurred while loading the app. Please refresh the page, or contact support if the issue continues.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex rounded-full bg-[var(--color-brand-600)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-brand-700)]"
            >
              Reload page
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
