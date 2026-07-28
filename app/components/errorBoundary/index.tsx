import { Component } from "react";

import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Shown instead of the crashed subtree. Defaults to the standard notice. */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time throws so one bad component degrades instead of blanking
 * the whole app.
 *
 * This exists because a single unguarded property access in a shared component
 * (see the falsy-children note for `<If>` in AGENTS.md) took the entire page
 * down with a bare "client-side exception has occurred". Wrap page content and
 * any independently-failing panel.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Replace with a real reporter (Sentry et al) when one is wired up.
    console.error("Unhandled render error", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div className="my-8 rounded-xl border border-neutral-200 p-6">
        <p className="text-md font-semibold text-neutral-800">Something went wrong</p>
        <p className="mt-2 text-sm text-neutral-500">
          This section failed to render. The rest of the app is unaffected — reloading usually clears it.
        </p>
        <p className="font-mono mt-3 break-words text-xs text-neutral-400">{error.message}</p>
        <button type="button" className="chip mt-4" onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}
