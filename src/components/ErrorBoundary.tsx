/**
 * Error Boundary
 *
 * Catches runtime errors in any tab/component and shows a recovery
 * screen instead of a blank white page. Without this, one broken
 * component unmounts the entire React tree.
 *
 * Usage: wrap any subtree that might throw
 *   <ErrorBoundary label="Pipeline CRM">
 *     <Pipeline />
 *   </ErrorBoundary>
 */
import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children:  ReactNode
  label?:    string       // name shown in error message
  fallback?: ReactNode    // custom fallback UI
}

interface State {
  hasError:  boolean
  error:     Error | null
  errorInfo: ErrorInfo | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[FlipScan ErrorBoundary] ${this.props.label || 'Component'} crashed:`, error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) return this.props.fallback

    const label = this.props.label || 'This section'
    const msg   = this.state.error?.message || 'Unknown error'

    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center"
        style={{ background: '#F8FAFC' }}>
        <div className="text-5xl mb-4">⚠️</div>
        <div className="text-lg font-bold mb-2" style={{ color: '#0F2460' }}>
          {label} encountered an error
        </div>
        <div className="text-sm mb-4 max-w-md leading-relaxed" style={{ color: '#64748B' }}>
          {msg.slice(0, 200)}
        </div>
        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white border-none cursor-pointer"
            style={{ background: '#0F2460' }}>
            ↻ Retry
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold border-none cursor-pointer"
            style={{ background: '#E2E8F0', color: '#475569' }}>
            Reload App
          </button>
        </div>
        {import.meta.env.DEV && this.state.errorInfo && (
          <pre className="mt-6 text-left text-[10px] p-4 rounded-xl overflow-auto max-w-2xl max-h-48"
            style={{ background: '#1E293B', color: '#94A3B8' }}>
            {this.state.errorInfo.componentStack}
          </pre>
        )}
      </div>
    )
  }
}
