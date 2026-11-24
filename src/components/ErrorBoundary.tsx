import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
  sectionLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally omit raw stack traces from user-visible UI
  }

  handleReset = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-xl border border-slate-200 bg-slate-50 p-6 sm:p-8 text-center space-y-4 my-4"
        >
          <AlertTriangle className="w-8 h-8 text-amber-700 mx-auto" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">
              Unable to display {this.props.sectionLabel || 'this view'} right now
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              An unexpected display issue occurred. You can retry loading this section without losing your selected city or preferences.
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Reload Section
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
