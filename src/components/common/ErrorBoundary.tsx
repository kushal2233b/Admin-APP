import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  constructor(props: Props) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Admin Portal ErrorBoundary Caught Error]:', error);
    console.error('[Admin Portal ErrorBoundary Component Stack]:', errorInfo.componentStack);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0814] text-white flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-[#130F26] border border-red-500/30 rounded-2xl p-8 max-w-lg w-full shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mb-4">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Admin Portal Encountered an Issue
            </h2>

            <p className="text-sm text-gray-300 mb-6 leading-relaxed">
              An unexpected error occurred while rendering this section. The application prevented a blank screen.
            </p>

            {this.state.error && (
              <div className="w-full bg-[#0A0814] border border-gray-800 rounded-lg p-3 mb-6 text-left overflow-x-auto max-h-40">
                <p className="text-xs font-mono text-red-400 font-semibold mb-1">
                  {this.state.error.name}: {this.state.error.message}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] font-mono text-gray-400 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                Try Recovering View
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold text-xs rounded-xl transition-all border border-gray-700 flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload Portal
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
